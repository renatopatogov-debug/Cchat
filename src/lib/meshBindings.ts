import type { MeshPeer } from "@/lib/bluetoothMesh";

/**
 * Vínculos verificados entre pubkey Nostr (hex de 64 chars) e chave Noise / peerID
 * da rede Bluetooth Mesh, evitando falsificação de apelido (spoofing) ao exibir
 * o selo `M` dentro das conversas normais.
 */
export interface MeshPeerBinding {
  nostrPubkey: string;
  noisePublicKey?: string;
  lastPeerID: string;
  updatedAt: number;
}

const STORAGE_KEY = "armada:mesh-bindings:v1";

export function readMeshBindings(): Record<string, MeshPeerBinding> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MeshPeerBinding>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMeshBinding(binding: MeshPeerBinding): void {
  if (typeof localStorage === "undefined") return;
  try {
    const current = readMeshBindings();
    current[binding.nostrPubkey] = binding;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // best-effort
  }
}

/**
 * Retorna o MeshPeer ativo vinculado criptograficamente a um contato Nostr, se estiver no alcance BLE.
 */
export function findBoundMeshPeer(
  nostrPubkey: string,
  livePeers: MeshPeer[],
): MeshPeer | undefined {
  if (livePeers.length === 0) return undefined;
  const binding = readMeshBindings()[nostrPubkey];
  if (!binding) return undefined;

  return livePeers.find((p) => {
    if (binding.noisePublicKey && p.noisePublicKey) {
      return p.noisePublicKey === binding.noisePublicKey;
    }
    return p.peerID === binding.lastPeerID;
  });
}
