# Inventário do Repositório (`signal-ui` — S0)

Levantamento estático direto em `D:\armada\src` (via `Select-String`) antes de iniciar as fatias S1–S7.

## Métricas Gerais

- **Total de arquivos em `src/`:** `2092`
- **Arquivos em `src/` citando `Armada` (case-sensitive / case-insensitive):** `382` / `555`
- **Arquivos em `src/` usando `clip-corner`:** `203`
- **Ocorrências de `Armada` em `src/i18n/locales/en.json` (exact / case-insensitive):** `148` / `154`
- **Tamanho de arquivos-chave:**
  - `src/concord/pages/ConcordPage.tsx`: `4351` linhas
  - `src/components/layout/ServerRail.tsx`: `2296` linhas
  - `src/pages/DMsPage.tsx`: `3211` linhas
  - `src/components/layout/ChannelSidebar.tsx`: `612` linhas
  - `src/components/auth/LoginScreen.tsx`: `605` linhas
  - `src/pages/WalletPage.tsx`: `774` linhas

---

## Rotas Atuais (`src/AppRouter.tsx`)

- **Públicas / Entrada (fora do layout):**
  - `/` (`HomeRedirect` -> `WelcomePage` ou `/dm`)
  - `/welcome` -> redirect `/`
  - `/join` (`JoinRoute` -> stashes relay & redirect `/`)
- **Dentro do `<MainLayout />` (a migrar para `<AppShell />` em S2):**
  - **Ficam no v1 (S4):** `/dm`, `/dm/:peer`, `/dm/:peer/m/:messageId`, `/dms`, `/dms/:peer` (redirects), `/wallet`, `/communities`, `/c/:communityId`, `/c/:communityId/:channelId`, `/c/:communityId/:channelId/m/:messageId` (plus `/t/:threadRoot` se mantido), `/create`, `/discover`, `/invite/:naddr`, `/invites`, `/notifications`, `/mesh`, `/share`, `/remoteloginsuccess`, `/settings`, `/privacy`, `/terms`, `/support`, `/:user`, `*` (`NotFound`).
  - **Saem da UI / viram redirect em S4:** `/s/:server`, `/s/:server/projects`, `/s/:server/inbox`, `/s/:server/:groupId*`, `/c/:communityId/history`, `/c/:communityId/<CONCORD2_PANES>`, `/import/discord`, `/gift/:from`, `/changelog`, `/downloads`.

---

## Mapa de Referências (`src/`) para Remoção Segura (S2–S5)

> Atenção: além dos imports diretos, a lista abaixo inclui arquivos que referenciam os símbolos em testes ou comentários estáticos (`Select-String` por `\bNome\b`). Conferir sempre antes de apagar.

- **`MainLayout`:** `src/AppRouter.tsx`, `src/components/AppsProvider.tsx`, `src/components/PersistentVoiceRoom.tsx`, `src/components/QuickSwitcher.tsx`, `src/components/layout/MainLayout.tsx`, `src/components/layout/MainLayout.settings.test.tsx`, `src/components/layout/MainLayout.suspense.test.tsx`, `src/components/layout/ServerRail.tsx`, `src/components/layout/SwipeReveal.tsx`, `src/concord/pages/ConcordPage.tsx`, `src/lib/profileOverlay.ts`, `src/lib/shareTargets.ts`
- **`ServerRail`:** `src/buzz/BuzzInvitePage.tsx`, `src/components/QuickSwitcher.tsx`, `src/components/layout/DetailPage.tsx`, `src/components/layout/DetailPage.test.tsx`, `src/components/layout/MainLayout.tsx`, `src/components/layout/MainLayout.settings.test.tsx`, `src/components/layout/MainLayout.suspense.test.tsx`, `src/components/layout/ServerRail.tsx`, `src/components/layout/ServerRail.test.tsx`, `src/concord/pages/ConcordPage.tsx`, `src/concord/pages/InvitePage.tsx`, `src/concord/pages/InvitesPage.tsx`, `src/concord/hooks/useCommunityRumors.railLoad.test.tsx`, `src/concord/hooks/useCommunityRumors.warmupChurn.perf.test.tsx`, `src/concord/hooks/useConcordUnread.network.test.tsx`, `src/concord/lib/rumorStore.railLoad.perf.test.ts`, `src/contexts/AppContext.ts`, `src/pages/DMsPage.tsx`, `src/pages/DiscoverPage.tsx`, `src/pages/GiftPage.tsx`, `src/pages/GiftPage.test.tsx`, `src/pages/GroupPage.tsx`, `src/pages/InboxPage.tsx`, `src/pages/MeshPage.tsx`, `src/pages/NotificationsPage.tsx`, `src/pages/ProjectsPage.tsx`, `src/pages/ServerPage.tsx`
- **`SwipeReveal`:** `src/components/auth/AccountSwitcher.tsx`, `src/components/auth/LoginScreen.tsx`, `src/components/chat/ChatShell.tsx`, `src/components/chat/MessageActionSheet.tsx`, `src/components/chat/MessageRow.tsx`, `src/components/chat/ThreadPanel.tsx`, `src/components/chat/rowFlash.ts`, `src/components/chat/rowFlash.test.ts`, `src/components/layout/MainLayout.tsx`, `src/components/layout/MainLayout.settings.test.tsx`, `src/components/layout/ServerRail.tsx`, `src/components/layout/SwipeReveal.tsx`, `src/components/onboarding/WizardShell.back.test.tsx`, `src/concord/pages/InvitesPage.tsx`, `src/contexts/PaneCoveredContext.ts`, `src/hooks/useBackDismiss.test.tsx`, `src/hooks/useMobileMembersOverlay.test.tsx`, `src/hooks/useNotificationNavigation.ts`, `src/hooks/usePinScrollOrigin.ts`, `src/hooks/usePinScrollOrigin.test.ts`, `src/hooks/useSwipeToReply.test.ts`, `src/lib/coldLaunchDeepLink.ts`, `src/lib/deepLinkNav.ts`, `src/pages/DMsPage.tsx`, `src/pages/GroupPage.tsx`, `src/pages/InboxPage.tsx`, `src/pages/MeshPage.tsx`, `src/pages/ProjectsPage.tsx`
- **`ChannelSidebar` / `ChannelSidebarView`:** `src/components/layout/ChannelSidebar.tsx`, `src/components/layout/ChannelSidebarView.tsx`, `src/components/layout/ServerRail.tsx`, `src/concord/pages/ConcordPage.tsx`, `src/pages/DMsPage.tsx`, `src/pages/GroupPage.tsx`, `src/pages/InboxPage.tsx`, `src/pages/MeshPage.tsx`, `src/pages/ProjectsPage.tsx`, `src/pages/ServerPage.tsx`
- **`ConcordPage`:** `src/AppRouter.tsx`, `src/build/lazyBoundaries.test.ts` *(atualizar para `CommunityScreen.tsx` em S4)*, `src/components/chat/MessageTimeline.switch.test.tsx`, `src/concord/pages/ConcordPage.tsx`, `src/concord/pages/ChannelRow.calls.test.tsx` *(apagar/migrar em S4)*, `src/concord/pages/ChannelRow.perf.test.tsx` *(apagar/migrar em S4)*, `src/concord/hooks/rosterSettle.ts`, `src/concord/hooks/useChannel.test.tsx`, `src/concord/hooks/useConcordThreads.ts`, `src/concord/hooks/useConcordUnread.network.test.tsx`, `src/concord/hooks/useModeration.ts`, `src/concord/hooks/useRekey.ts`, `src/concord/hooks/useRekey.test.tsx`, `src/concord/lib/channel.parity.test.ts`, `src/hooks/useMobileMembersOverlay.test.tsx`
- **`ArmadaWreck` / `GameOverScreen` (atualizar consumidores antes de S5):** `src/components/brand/ArmadaWreck.tsx`, `src/components/brand/GameOverScreen.tsx`, `src/components/brand/useWreckMusic.ts`, `src/components/brand/WreckDove.tsx`, `src/components/profile/UserBanned.tsx`, `src/concord/components/CommunityBlocked.tsx`, `src/build/lazyBoundaries.test.ts` *(também aponta `UserBanned.tsx` em `concord/components` se houver)*
- **`BrandMark` / `TerminalProgress` / `SignalStatic`:** `src/components/AccountExitGate.tsx`, `src/components/DBMigrationGate.tsx`, `src/components/SyncGate.tsx`, `src/components/landing/LandingPage.tsx`, `src/components/brand/{BrandMark,TerminalProgress,SignalStatic,signalStaticField}`
- **`DittoIcon` (manter/mover, não deletar em S5):** `src/components/brand/DittoIcon.tsx`, `src/components/chat/EmbeddedNote.tsx`, `src/components/chat/ProfilePreviewCard.tsx`, `src/components/profile/ProfileDialog.tsx`, `src/pages/DMsPage.tsx`

## Testes Sensíveis a Classes/Seletores de UI

- `src/pages/DMsPage.list.test.tsx`: conta linhas via `container.querySelectorAll("button.clip-corner")` (S4 deve migrar para `data-testid="conversation-row"`).
- `src/components/chat/FloatingDateBadge.test.tsx`: linha 97 usa `document.querySelector(".clip-corner")` (S4 deve migrar para `data-testid`).
- `src/pages/WelcomePage.eager.test.tsx`: exige botão `<FormattedMessage id="landingPage.join" />` síncrono no 1º render e `LoginScreen`/`SignupWizard` lazy.
- `src/lib/downloads.test.ts`: confere `.ngit/act/workflows/release.yml` e `<noscript>` do `index.html` (atualizar em conjunto na S5).
- `src/build/lazyBoundaries.test.ts`: verifica fechamento estático de `ConcordPage.tsx` (migrar para `CommunityScreen.tsx` em S4).
