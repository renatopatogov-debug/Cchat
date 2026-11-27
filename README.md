# Cchat

Chat criptografado ponta-a-ponta (Nostr / Concord + Bluetooth Mesh) integrado com **carteira digital non-custodial**, **QR Code estilo Pix** e **escrow on-chain para entregas físicas com código de confirmação (estilo iFood)**.

> **Base e Créditos:** Este projeto é construído sobre a base open-source do [**Armada**](https://github.com/soapbox-pub/armada) (desenvolvido pelo coletivo **Soapbox**), utilizando o protocolo [**Nostr**](https://github.com/nostr-protocol/nostr), comunidades criptografadas [**Concord**](https://github.com/concord-protocol/concord), grupos **NIP-29** e transporte Bluetooth Mesh compatível com **bitChat**.

---

## Principais Recursos

### 1. Chat & Mesh Offline
* **Conversas 1:1, grupos e comunidades E2EE:** mensagens via relays Nostr e protocolo Concord (`src/concord/`).
* **Bluetooth Mesh (Android):** comunicação local sem internet via `src/lib/bluetoothMesh.ts` e `src/components/MeshProvider.tsx`.
* **Fila persistente offline:** pacotes financeiros (`confirmDelivery` e `extendDeadline`) recebidos pela Mesh são gravados imediatamente em `IndexedDB` (`src/lib/meshOutbox.ts`) para envio automático quando a conexão retornar.

### 2. Carteira Non-Custodial & QR Code v2
* **Sem custódia da plataforma:** as chaves privadas ficam apenas no aparelho do usuário (`src/lib/evmWallet.ts`), cifradas com `AES-GCM` + `PBKDF2` por PIN (usando `SecureStoragePlugin` no Android e envelope cifrado no Web/Desktop).
* **Compatível com contas Nostr existentes:** permite derivar a carteira EVM deterministicamente a partir do `nsec` (`HKDF-SHA256`) ou criar/importar chave separada para logins `NIP-07` / `NIP-46`.
* **QR v2 anti-phishing (`src/lib/escrowClient.ts`):** valida endereço oficial do contrato de escrow, token na whitelist (`BRZ` / `USDC` na rede **Base**), *minor units* e assinatura EIP-712 vinculando a carteira EVM ao `npub` do vendedor.

### 3. Escrow On-Chain com Código de Entrega (`contracts/DeliveryEscrow.sol`)
* **Commit-reveal on-chain:** o comprador gera localmente um código de 6 dígitos + `salt` de 128 bits (`keccak256(abi.encode(code, salt))`) — nenhum servidor central guarda o segredo nem decide a liberação.
* **Proteções de ciclo de vida:**
  * `DISPUTE_GRACE_PERIOD` (24h após o prazo de entrega)
  * `ARBITER_TIMEOUT` (15 dias para evitar fundos presos caso o árbitro fique inativo)
  * `refundBySeller` (cancelamento amigável imediato pelo vendedor)
  * `extendDeadline` via assinatura EIP-712 / EIP-1271 (compatível com `ERC-4337`)

---

## Estrutura Adicionada ao Repositório

* `contracts/DeliveryEscrow.sol` — Smart Contract de escrow em Solidity `^0.8.24` (OpenZeppelin v5).
* `contracts/MockBRZ.sol` — Token ERC-20 de teste (18 decimais + `ERC20Permit`) para simulações no Remix IDE / Base Sepolia.
* `src/lib/escrowClient.ts` — Codificação ABI, derivação determinística do código entre dispositivos, validação QR v2 e consultas RPC on-chain.
* `src/lib/evmWallet.ts` — Armazenamento cifrado `AES-GCM`, derivação opcional por `nsec` e backup portátil.
* `src/lib/meshOutbox.ts` — Fila `IndexedDB` com deduplicação e auto-sync ao voltar sinal.
* `src/components/chat/EscrowOrderCard.tsx` — Card de pedido com verificação direta na blockchain (`orders(orderId)`).
* `src/pages/WalletPage.tsx` — Página `/wallet` com saldo `BRZ`/`USDC`, leitor de QR por câmera, gerador de QR v2 e painel de testes Base Sepolia.
* `.github/workflows/ci-and-android.yml` — Pipeline de nuvem para TypeScript, ESLint, i18n, Vitest, build Web e geração do APK Android.

---

## Desenvolvimento e Build na Nuvem

### Rodar localmente (Requer Node.js >= 22)
```sh
npm install
npm run dev
npm run test
```

### Build 100% Online (GitHub Actions + Remix IDE)
* **Web + APK Android:** cada `push` na branch `main` executa `.github/workflows/ci-and-android.yml` e gera os artefatos `armada-web-dist` e `armada-debug-apk` na aba **Actions**.
* **Smart Contracts:** cole `contracts/MockBRZ.sol` e `contracts/DeliveryEscrow.sol` no [Remix IDE](https://remix.ethereum.org), compile com Solidity `0.8.24`, faça o deploy em **Base Sepolia** e informe os endereços gerados diretamente na tela `/wallet` do app.

---

## Licença

Este projeto mantém a licença original **GNU Affero General Public License v3.0 (AGPL-3.0)** — veja [LICENSE](LICENSE).
