// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title DeliveryEscrow
 * @notice Escrow non-custodial para entregas físicas com commit-reveal on-chain,
 *         janela de graça para disputas, proteção contra árbitro inativo (ARBITER_TIMEOUT),
 *         devolução amigável pelo vendedor, extensão de prazo via EIP-712 + EIP-1271 (ERC-4337)
 *         e compatibilidade com relayers EIP-2771.
 */
contract DeliveryEscrow is ReentrancyGuard, EIP712, ERC2771Context {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Locked,
        Released,
        Disputed,
        Refunded
    }

    /// @dev Campos ordenados para empacotamento em 7 slots de storage (economiza 3 SSTOREs no createOrder).
    struct Order {
        address buyer;           // slot 0 (20B)
        Status status;           // slot 0 (1B)
        address seller;          // slot 1 (20B)
        uint64 deliveryDeadline; // slot 1 (8B)
        address arbiter;         // slot 2 (20B) — address(0) = pedido P2P sem árbitro
        uint64 disputedAt;       // slot 2 (8B)
        IERC20 token;            // slot 3 (20B)
        uint256 amount;          // slot 4 (32B)
        bytes32 codeCommitment;  // slot 5 (32B) — keccak256(abi.encode(uint256 code, uint256 salt))
        uint256 deadlineNonce;   // slot 6 (32B)
    }

    /// @notice Janela adicional após deliveryDeadline para abrir disputa ou confirmar entrega.
    uint64 public constant DISPUTE_GRACE_PERIOD = 24 hours;

    /// @notice Prazo máximo para o árbitro julgar uma disputa antes de destravar reembolso de segurança.
    uint64 public constant ARBITER_TIMEOUT = 15 days;

    bytes32 private constant EXTEND_DEADLINE_TYPEHASH =
        keccak256("ExtendDeadline(uint256 orderId,uint64 newDeadline,uint256 nonce,uint64 sigExpiry)");

    uint256 public nextOrderId = 1;
    mapping(uint256 => Order) public orders;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed seller,
        address arbiter,
        address token,
        uint256 amount,
        uint64 deliveryDeadline,
        bytes32 codeCommitment
    );
    event DeliveryConfirmed(uint256 indexed orderId, address indexed caller, uint256 timestamp);
    event DeadlineExtended(uint256 indexed orderId, uint64 newDeadline, uint256 nonce);
    event DisputeOpened(uint256 indexed orderId, address indexed openedBy, uint64 disputedAt);
    event DisputeResolved(uint256 indexed orderId, address indexed arbiter, bool releasedToSeller);
    event OrderRefunded(uint256 indexed orderId, address indexed recipient, string reason);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidCommitment();
    error InvalidStatus();
    error Unauthorized();
    error ArbiterNotSet();
    error BadCommitment();
    error PastDeliveryWindow();
    error GracePeriodNotElapsed();
    error ArbiterTimeoutNotElapsed();
    error SignatureExpired();
    error InvalidSignature();

    /**
     * @param trustedForwarder_ Endereço do relayer EIP-2771 (ou address(0) se usar apenas ERC-4337 / chamadas diretas).
     */
    constructor(address trustedForwarder_)
        EIP712("ArmadaDeliveryEscrow", "1")
        ERC2771Context(trustedForwarder_)
    {}

    /**
     * @notice Cria um pedido travando os tokens no contrato (requer approve prévio ou batch ERC-4337).
     */
    function createOrder(
        address seller,
        address arbiter,
        IERC20 token,
        uint256 amount,
        uint64 deliveryDeadline,
        bytes32 codeCommitment
    ) external nonReentrant returns (uint256 orderId) {
        orderId = _createOrder(
            _msgSender(),
            seller,
            arbiter,
            token,
            amount,
            deliveryDeadline,
            codeCommitment
        );
    }

    /**
     * @notice Cria um pedido usando EIP-2612 Permit (útil para tokens com permit + relayer sem ETH).
     */
    function createOrderWithPermit(
        address seller,
        address arbiter,
        IERC20 token,
        uint256 amount,
        uint64 deliveryDeadline,
        bytes32 codeCommitment,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 orderId) {
        address buyer = _msgSender();
        // try/catch evita griefing caso alguém já tenha submetido a assinatura permit na mempool
        try IERC20Permit(address(token)).permit(buyer, address(this), amount, permitDeadline, v, r, s) {} catch {}

        orderId = _createOrder(
            buyer,
            seller,
            arbiter,
            token,
            amount,
            deliveryDeadline,
            codeCommitment
        );
    }

    /**
     * @notice Libera os fundos ao vendedor quando qualquer portador (vendedor, comprador ou nó mesh)
     *         apresentar o par (code, salt) válido.
     * @dev Aceita tanto Status.Locked (dentro da janela) quanto Status.Disputed (caso as partes se
     *      resolvam presencialmente ou o comprador tenha tentado abrir disputa após revelar o QR).
     */
    function confirmDelivery(uint256 orderId, uint256 code, uint256 salt) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.status == Status.Locked) {
            if (block.timestamp > o.deliveryDeadline + DISPUTE_GRACE_PERIOD) revert PastDeliveryWindow();
        } else if (o.status != Status.Disputed) {
            revert InvalidStatus();
        }

        if (keccak256(abi.encode(code, salt)) != o.codeCommitment) revert BadCommitment();

        o.status = Status.Released;
        o.token.safeTransfer(o.seller, o.amount);
        emit DeliveryConfirmed(orderId, _msgSender(), block.timestamp);
    }

    /**
     * @notice Permite ao vendedor cancelar e devolver 100% ao comprador imediatamente (em Locked ou Disputed).
     */
    function refundBySeller(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.status != Status.Locked && o.status != Status.Disputed) revert InvalidStatus();
        if (_msgSender() != o.seller) revert Unauthorized();

        o.status = Status.Refunded;
        o.token.safeTransfer(o.buyer, o.amount);
        emit OrderRefunded(orderId, o.buyer, "seller_cancelled");
    }

    /**
     * @notice Estende o prazo de entrega com assinatura EIP-712 / EIP-1271 do comprador
     *         (suporta tanto EOA quanto Smart Accounts ERC-4337 e pode ser enviada via Mesh/Relayer).
     */
    function extendDeadline(
        uint256 orderId,
        uint64 newDeadline,
        uint64 sigExpiry,
        bytes calldata buyerSignature
    ) external nonReentrant {
        if (block.timestamp > sigExpiry) revert SignatureExpired();

        Order storage o = orders[orderId];
        if (o.status != Status.Locked) revert InvalidStatus();
        if (newDeadline <= o.deliveryDeadline) revert InvalidDeadline();

        uint256 currentNonce = o.deadlineNonce;
        bytes32 structHash = keccak256(
            abi.encode(EXTEND_DEADLINE_TYPEHASH, orderId, newDeadline, currentNonce, sigExpiry)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        // Effects antes da chamada externa isValidSignatureNow (CEI pattern)
        o.deadlineNonce = currentNonce + 1;
        o.deliveryDeadline = newDeadline;

        if (!SignatureChecker.isValidSignatureNow(o.buyer, digest, buyerSignature)) {
            revert InvalidSignature();
        }

        emit DeadlineExtended(orderId, newDeadline, currentNonce);
    }

    /**
     * @notice Abre disputa antes do fim da janela de graça.
     */
    function openDispute(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.status != Status.Locked) revert InvalidStatus();
        if (o.arbiter == address(0)) revert ArbiterNotSet();

        address caller = _msgSender();
        if (caller != o.buyer && caller != o.seller) revert Unauthorized();
        if (block.timestamp > o.deliveryDeadline + DISPUTE_GRACE_PERIOD) revert PastDeliveryWindow();

        uint64 nowTs = uint64(block.timestamp);
        o.status = Status.Disputed;
        o.disputedAt = nowTs;
        emit DisputeOpened(orderId, caller, nowTs);
    }

    /**
     * @notice Árbitro decide o destino dos fundos em disputa.
     */
    function resolveDispute(uint256 orderId, bool releaseToSeller) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.status != Status.Disputed) revert InvalidStatus();
        if (_msgSender() != o.arbiter) revert Unauthorized();

        o.status = releaseToSeller ? Status.Released : Status.Refunded;
        address recipient = releaseToSeller ? o.seller : o.buyer;
        o.token.safeTransfer(recipient, o.amount);
        emit DisputeResolved(orderId, o.arbiter, releaseToSeller);
    }

    /**
     * @notice Devolve 100% ao comprador após deliveryDeadline + DISPUTE_GRACE_PERIOD sem entrega nem disputa.
     */
    function refundTimeout(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.status != Status.Locked) revert InvalidStatus();
        if (block.timestamp <= o.deliveryDeadline + DISPUTE_GRACE_PERIOD) revert GracePeriodNotElapsed();

        o.status = Status.Refunded;
        o.token.safeTransfer(o.buyer, o.amount);
        emit OrderRefunded(orderId, o.buyer, "timeout");
    }

    /**
     * @notice Válvula de segurança: se o árbitro abandonar a disputa por mais de ARBITER_TIMEOUT (15 dias),
     *         destrava o reembolso ao comprador para que os fundos nunca fiquem presos eternamente.
     */
    function refundArbiterTimeout(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.status != Status.Disputed) revert InvalidStatus();
        if (block.timestamp <= o.disputedAt + ARBITER_TIMEOUT) revert ArbiterTimeoutNotElapsed();

        o.status = Status.Refunded;
        o.token.safeTransfer(o.buyer, o.amount);
        emit OrderRefunded(orderId, o.buyer, "arbiter_timeout");
    }

    function _createOrder(
        address buyer,
        address seller,
        address arbiter,
        IERC20 token,
        uint256 amount,
        uint64 deliveryDeadline,
        bytes32 codeCommitment
    ) internal returns (uint256 orderId) {
        if (seller == address(0) || address(token) == address(0)) revert InvalidAddress();
        if (seller == buyer || arbiter == buyer || arbiter == seller) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (deliveryDeadline <= block.timestamp) revert InvalidDeadline();
        if (codeCommitment == bytes32(0)) revert InvalidCommitment();

        orderId = nextOrderId++;
        orders[orderId] = Order({
            buyer: buyer,
            seller: seller,
            arbiter: arbiter,
            token: token,
            amount: amount,
            deliveryDeadline: deliveryDeadline,
            disputedAt: 0,
            codeCommitment: codeCommitment,
            deadlineNonce: 0,
            status: Status.Locked
        });

        token.safeTransferFrom(buyer, address(this), amount);

        emit OrderCreated(
            orderId,
            buyer,
            seller,
            arbiter,
            address(token),
            amount,
            deliveryDeadline,
            codeCommitment
        );
    }
}
