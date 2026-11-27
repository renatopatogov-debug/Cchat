// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockBRZ
 * @notice Token ERC-20 de teste com 18 decimais e EIP-2612 Permit para simular o BRZ
 *         no Remix IDE ou em Base Sepolia junto com o DeliveryEscrow.sol.
 */
contract MockBRZ is ERC20, ERC20Permit {
    constructor() ERC20("Mock Brazilian Digital", "mBRZ") ERC20Permit("Mock Brazilian Digital") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    /**
     * @notice Emite tokens de teste para qualquer endereço (apenas para testes).
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
