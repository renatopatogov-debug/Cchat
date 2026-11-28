# AGENTS.md — Cchat

Guia arquitetural e operacional para agentes trabalhando no **Cchat** (cliente Web React 19 + Vite, app Android Capacitor em `android/`, iOS em `ios/`, contratos Solidity em `contracts/`).

O **Cchat** é um aplicativo independente derivado do projeto open-source [Armada](https://github.com/soapbox-pub/armada) (Soapbox, licença **AGPL-3.0**), com frontend minimalista inspirado em **Signal / WhatsApp / Telegram** e motores criptográficos/financeiros completos:
1. **Conversas 1:1 e DMs em grupo (`/dm`)** sobre Nostr (NIP-17 / NIP-04) + **Bluetooth Mesh** offline (`/mesh`, badge `M`).
2. **Grupos Criptografados (`/communities`, `/c/*`)** sobre o protocolo [Concord](https://github.com/concord-protocol/concord) (CORD-01..08), contendo **Subgrupos de texto** e **Canais de Chamada de voz** (`view: "voice"`, LiveKit E2EE), sem vínculo com diretórios públicos do Armada (`/discover` removido) nem servidores NIP-29/Buzz (`/s/*` removido).
3. **Carteira Non-Custodial `BRZ`/`USDC` em Base L2 (`/wallet`)** + **Escrow On-Chain com Código de Entrega (`contracts/DeliveryEscrow.sol`)** + fila offline Mesh (`src/lib/meshOutbox.ts`).

---

## Mapa do Repositório

| Caminho | Responsabilidade |
|---|---|
| `src/AppRouter.tsx` | Roteamento principal SPA; rotas autenticadas envolvidas por `AppShell` |
| `src/components/layout/AppShell.tsx` | Shell único estilo Signal: `SignalBottomNav` no mobile (`/dm`, `/wallet`, `/communities`), sidebar esquerda no desktop (`>= 900px`), `CallProvider`, `DmCallProvider`, `AppsProvider`, overlays de Perfil e Configurações |
| `src/pages/DMsPage.tsx` | Conversas 1:1 / grupo NIP-17 & NIP-04, integração Bluetooth Mesh e chamadas diretas |
| `src/pages/CommunitiesHubPage.tsx` | Aba **Grupos**: listagem e criação (`/create`) de grupos privados criptografados |
| `src/pages/CommunityScreen.tsx` | Tela oficial de grupo (`/c/:communityId/:channelId?`): subgrupos de texto, canais de chamada de voz, guardas E2EE/rekey, membros (`CommunityMembersSheet`) e convites (`InviteDialog`) |
| `src/pages/WalletPage.tsx` | Carteira non-custodial `BRZ`/`USDC`, leitor/gerador QR v2 e gestão de entregas com escrow |
| `src/components/brand/` | Marca limpa do Cchat (`CchatLogo.tsx`, `BootSplash.tsx`) e ícone `DittoIcon.tsx` |
| `src/concord/` | Implementação completa do protocolo Concord (`lib/` e `hooks/` — **não alterar regras criptográficas**) |
| `src/lib/evmWallet.ts`, `escrowClient.ts`, `meshOutbox.ts`, `meshBindings.ts` | Motores EVM non-custodial, ABI/EIP-712 do escrow e fila offline Bluetooth Mesh |
| `contracts/` | `DeliveryEscrow.sol` e `MockBRZ.sol` (Solidity `^0.8.24`, OpenZeppelin v5) |
| `android/` | Projeto Android Capacitor (`applicationId = "app.cchat.mobile"`, `namespace = "buzz.armada.app"`) |
| `docs/SCOPE.md` | Escopo congelado do Cchat v1 |

---

## Regras Inegociáveis de Manutenção

1. **Chaves persistidas em disco (NUNCA renomear):**
   Mantenha intactos todos os prefixos de armazenamento local e Nostr NIP-78: `c2:`, `concord2-*`, `armada:evm-wallet:*`, `armada-escrow-mesh-outbox`, `armada:mesh-bindings:v1`, `armada:app-config`, `armada:locale`, `armada:terms-accepted`, `armada:font-scale`, `armada:reduce-*`, `armada:notif-prompt-shown`, `armada:battery-exemption-nudged-at` e `APP_ID = "armada"` em `src/lib/platform.ts` (exigido por `settingsDocs.test.ts` e `SelfState.DEFAULT_D_TAGS` no Android).
2. **Android `applicationId` vs `namespace`:**
   Em `capacitor.config.ts` e `android/app/build.gradle`, o `applicationId` publicado é `app.cchat.mobile`, mas o `namespace` Gradle e os pacotes Java/Kotlin em `android/app/src/main/java/buzz/armada/app/` permanecem `buzz.armada.app` para preservar os ~40 módulos nativos (SQLite FTS5, relay foreground service, Bluetooth Mesh, CallConnection).
3. **Hooks obrigatórios do Concord em `CommunityScreen.tsx`:**
   Nunca remova `useRegisterChannelStreamKeys`, `useRekeyWatch` + `useStrandedRecovery`, `useChannelRekeyWatch`, `useStaffKeyWatch`, `useRelayFollow`, `useWriterAccess`, `useCanPost` + `sendsIn`, `useDissolved`, `useIsExcluded`, `useRestoreJoin` e `scheduleExpiredSweep`.
4. **Qualidade estática e CI:**
   - ESLint trata `@typescript-eslint/no-unused-vars` e `no-explicit-any` como erro, e exige que arquivos `.tsx` de componentes exportem apenas componentes React (Fast Refresh).
   - `scripts/i18n.mjs check` exige sincronia exata entre `src/**/*.{ts,tsx}`, `src/i18n/locales/*.json`, `Strings.swift` e `strings.xml` (`notification.*`). Use `node scripts/i18n.mjs prune` sempre que remover mensagens da UI.
   - `src/build/lazyBoundaries.test.ts` verifica que `src/pages/CommunityScreen.tsx` não importa estaticamente bibliotecas pesadas (`@scure/btc-signer`, `react-easy-crop`, `react-day-picker`, `CommunitySettingsView`).
5. **Vitest split (`vite.config.ts`):**
   `*.test.tsx` roda em `jsdom`; `*.test.ts` roda em `node` (adicione `// @vitest-environment jsdom` na linha 1 se um `.test.ts` precisar de DOM).
