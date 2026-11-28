# Cchat

Chat criptografado ponta-a-ponta (Nostr NIP-17 + Grupos Concord E2EE + Bluetooth Mesh) com interface minimalista inspirada no **Signal**, integrado com **carteira digital non-custodial (`BRZ`/`USDC` em Base L2)**, **QR Code v2** e **escrow on-chain para entregas físicas com código de confirmação**.

> **Base e Créditos (AGPL-3.0):** O Cchat é construído como software livre independente sobre a base open-source do [**Armada**](https://github.com/soapbox-pub/armada) (desenvolvido pelo coletivo **Soapbox**), utilizando os protocolos [**Nostr**](https://github.com/nostr-protocol/nostr), [**Concord**](https://github.com/concord-protocol/concord) e transporte Bluetooth Mesh compatível com **bitChat**.

---

## Principais Recursos

### 1. Conversas, Grupos com Subgrupos & Bluetooth Mesh
* **Conversas 1:1 e em grupo (`/dm`):** mensagens privadas via NIP-17 (rumors selados) e fallback explícito NIP-04, com chamadas de voz e indicador `M` quando o contato está no alcance Bluetooth.
* **Grupos Privados com Subgrupos & Canais de Chamada (`/communities` e `/c/*`):** grupos criptografados ponta-a-ponta sem servidor central (`src/concord/`), organizados com subgrupos de texto e salas de chamada de voz ao vivo, convites diretos (`/invites`) e links de convite (`/invite/:naddr`).
* **Bluetooth Mesh Offline (`/mesh` no Android):** comunicação local sem internet (`src/lib/bluetoothMesh.ts`) e fila persistente em `IndexedDB` (`src/lib/meshOutbox.ts`) que sincroniza confirmações financeiras automaticamente quando a conexão retorna.

### 2. Carteira Non-Custodial & QR Code v2 (`/wallet`)
* **Sem custódia da plataforma:** chaves privadas cifradas localmente no dispositivo (`src/lib/evmWallet.ts`) com `AES-GCM` + `PBKDF2` por PIN (usando `SecureStoragePlugin` no Android e envelope cifrado na Web/Desktop).
* **Compatível com contas Nostr:** derivação determinística a partir do `nsec` (`HKDF-SHA256`) ou chave independente para contas `NIP-07` / `NIP-46`.
* **QR v2 anti-phishing (`src/lib/escrowClient.ts`):** valida endereço oficial do contrato, whitelist de tokens (`BRZ` / `USDC` na rede **Base**) e assinatura EIP-712 vinculando a carteira EVM ao `npub` do vendedor.

### 3. Escrow On-Chain com Código de Entrega (`contracts/DeliveryEscrow.sol`)
* **Commit-reveal on-chain:** código de 6 dígitos + `salt` de 128 bits (`keccak256(abi.encode(code, salt))`) gerado localmente pelo comprador — nenhum servidor central conhece o segredo.
* **Proteções de ciclo de vida:** `DISPUTE_GRACE_PERIOD` (24h), `ARBITER_TIMEOUT` (15 dias), `refundBySeller` imediato e `extendDeadline` via assinatura EIP-712 / EIP-1271 (`ERC-4337`).

---

## Identidade Android & Build na Nuvem

* **Application ID Android:** `app.cchat.mobile` (`capacitor.config.ts` e `android/app/build.gradle`, mantendo `namespace = "buzz.armada.app"` para os módulos Kotlin/Java nativos).
* **GitHub Actions (`.github/workflows/ci-and-android.yml`):** executa `tsc`, `eslint`, `i18n:check`, `vitest`, bundle Web (`cchat-web-dist`) e gera o APK Android (`cchat-debug-apk`).

### Comandos locais (Node.js >= 22)
```sh
npm ci
npm run dev
npm run test
```

---

## Licença

Distribuído sob a licença **GNU Affero General Public License v3.0 (AGPL-3.0)** — veja [LICENSE](LICENSE).
