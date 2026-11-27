import { Compass, Plus, Settings, Users } from "lucide-react";
import { useContext } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useLiveCommunities } from "@/concord/hooks/useCommunityList";
import { useNip29Servers } from "@/hooks/useNip29Servers";
import { relayToRouteParam } from "@/lib/platform";
import { SettingsOverlayContext } from "@/lib/settingsOverlay";

/**
 * Aba Comunidades (estilo Signal): agrupa todos os servidores Concord e NIP-29
 * fora da lista principal de Conversas 1:1, mantendo a home limpa.
 */
export function CommunitiesHubPage() {
  const navigate = useNavigate();
  const settings = useContext(SettingsOverlayContext);
  const communities = useLiveCommunities();
  const nip29Servers = useNip29Servers();

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-background">
      <header className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Comunidades</h1>
          <p className="text-xs text-muted-foreground">
            Canais de grupo e salas de voz separados das suas conversas
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full"
            aria-label="Explorar comunidades"
            onClick={() => navigate("/discover")}
          >
            <Compass className="size-5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full"
            aria-label="Criar comunidade"
            onClick={() => navigate("/create")}
          >
            <Plus className="size-5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full sidebar:hidden"
            aria-label="Configurações"
            onClick={() => settings.show()}
          >
            <Settings className="size-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-8 sidebar:pb-6 space-y-4 max-w-2xl w-full mx-auto">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => navigate("/create")}
          >
            <Plus className="size-4 mr-1.5" />
            Nova Comunidade
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => navigate("/discover")}
          >
            <Compass className="size-4 mr-1.5" />
            Explorar Públicas
          </Button>
        </div>

        {communities.length === 0 && nip29Servers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
            <div className="size-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mx-auto">
              <Users className="size-6" />
            </div>
            <p className="text-sm font-semibold">Você ainda não entrou em nenhuma comunidade</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Crie uma comunidade criptografada para vendas, eventos ou grupos de interesse, ou explore comunidades públicas.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {communities.map((c) => {
              const label = c.current.name || `Comunidade ${c.community_id.slice(0, 8)}`;
              return (
                <button
                  key={c.community_id}
                  type="button"
                  onClick={() => navigate(`/cc/${encodeURIComponent(c.community_id)}`)}
                  className="w-full rounded-2xl border border-border bg-card hover:bg-secondary/60 transition p-3.5 flex items-center gap-3 text-left"
                >
                  <span className="size-11 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center shrink-0">
                    {label.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Comunidade criptografada ponta-a-ponta (Concord)
                    </p>
                  </div>
                </button>
              );
            })}

            {nip29Servers.map((url) => {
              const host = url.replace(/^wss?:\/\//i, "");
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => navigate(`/s/${relayToRouteParam(url)}`)}
                  className="w-full rounded-2xl border border-border bg-card hover:bg-secondary/60 transition p-3.5 flex items-center gap-3 text-left"
                >
                  <span className="size-11 rounded-2xl bg-secondary text-secondary-foreground font-bold text-sm flex items-center justify-center shrink-0">
                    {host.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{host}</p>
                    <p className="text-xs text-muted-foreground truncate">Servidor Relay NIP-29</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
