# Escopo Cchat v1 (Reconstrução UI Estilo Signal)

**Frase do produto:** Mensageiro criptografado ponta-a-ponta com carteira BRZ sem custódia, escrow on-chain com código de confirmação e transporte Bluetooth Mesh offline.

Baseado no código-fonte aberto do **Armada** (`soapbox-pub/armada`, licença **AGPL-3.0**). Todos os créditos e a licença AGPL-3.0 permanecem no repositório e na tela Sobre.

---

## O que FICA visível no v1

- **Entrada / Conta:** Tela de boas-vindas limpa (`Cchat`), criação de conta em passo simples (nome + foto opcional, chave gerada em background + lembrete `KeyBackupReminder`), login com campo único (`chave secreta` / `bunker://`) + opções avançadas colapsadas (QR signer, extensão NIP-07, arquivo `.txt`, Android signer).
- **Conversas 1:1 e Grupos DM (`/dm`, `/dm/:peer`):**
  - Lista limpa estilo Signal com filtros `Todas`, `Não lidas`, `Por perto (M)`.
  - Transporte NIP-17 / NIP-04 preservado; chamadas 1:1 DM preservadas.
  - **Bluetooth Mesh integrado:** badge `M` por vínculo criptográfico (`src/lib/meshBindings.ts`), banner offline automático e rota `/mesh` mantida como fallback quando o usuário toca num peer Mesh próximo sem vínculo Nostr prévio.
- **Carteira & Escrow BRZ (`/wallet`):**
  - Carteira EVM local cifrada (`AES-GCM` + Android Keystore + derivação opcional por `nsec`).
  - Redes Base Mainnet (`8453`, BRZ/USDC) e Base Sepolia (`84532`, override Remix).
  - Fluxo QR v2 EIP-712 + `DeliveryEscrow.sol` (código 6 dígitos + `salt`) + fila offline `meshOutbox.ts`.
- **Comunidades Simples (`/communities`, `/c/*`, `/create`, `/discover`, `/invite/:naddr`, `/invites`):**
  - Hub de comunidades em lista Signal (`CommunitiesHubPage`).
  - Nova `CommunityScreen`: lista de canais de texto + conversa no canal com `MessageTimeline`, `ChatComposer`, `ChatSearchBar`, folha de membros, convite (`InviteDialog`) e opção Sair da comunidade.
  - **Camada Concord obrigatória no v1 (não cortar):** `useTransport`, `useRegisterChannelStreamKeys`, `useRekeyWatch` (`stranded`), `useChannelRekeyWatch`, `useDissolved`, `useIsExcluded`, `useRestoreJoin`, `useCanPost`, `useGuestbook` (`timeouts`).
- **Suporte / Sistema:** Notificações (`/notifications`), Encaminhar (`/share`), Configurações (`/settings`), Legais (`/privacy`, `/terms`, `/support`), Perfil (`/:user`), Callback remote signer (`/remoteloginsuccess`).

## O que SAI da UI no v1 (código backend/infra pode permanecer dormente; rotas saem na S4)

- **NIP-29 / Buzz servers:** `/s/*` (`ServerPage`, `GroupPage`, `InboxPage`, `ProjectsPage`, `BuzzInvitePage`).
- **Extras estilo Discord:** Importação do Discord (`/import/discord`), Projetos Git (`/s/:server/projects`), UI de fóruns, calendário/eventos, barra de pins, busca avançada de tokens em comunidades, UI de cargos/boosters/access review/auditoria e botões de voz em canais Concord.
- **Monetização / Distribuição legada Armada:** Gift/Ultra (`/gift/:from`), Downloads (`/downloads`), Changelog (`/changelog`).
- **Cromagem / Mascote Armada:** `ServerRail`, `MainLayout`, `ChannelSidebar`, `SwipeReveal`, classes `clip-corner*` / `clip-hairline-lg`, `ArmadaWreck`, `GameOverScreen`, `WreckDove`, `TerminalProgress`, `BrandMark`, `SignalStatic` e `components/landing/`.

## Identificadores imutáveis em disco (NUNCA renomear)

`c2:`, `concord2-*`, `armada:evm-wallet:*`, `armada:testnet-escrow:*`, `armada-escrow-mesh-outbox`, `armada:mesh-bindings:v1`, `armada:app-config`, `armada:locale`, `armada:terms-accepted`, `armada:font-scale`, `armada:reduce-motion`, `armada:reduce-blur`, `armada:notif-prompt-shown`, `armada:battery-exemption-nudged-at`.
