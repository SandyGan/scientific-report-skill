import { sha256CanonicalJson, type Sha256Hash } from "./hash.js";
import type { DomainOverlay, RuleRegistry } from "./rules.js";

export const COMPILED_RULE_REGISTRY_HASH = "sha256:e6c97931994ca797abdbe15f693bb346a89aaa8ccdc84f37dd62e72bea43f9da" as Sha256Hash;

export const COMPILED_RULE_IDS = [
  "COV001", "COV002", "WRK001", "WRK002", "WRK003", "TIM001", "MAT001", "DER001", "CLM001", "BRG001",
  "DEP001", "CNF001", "NUL001", "NEG001", "REV001", "REP001", "ATT001", "RED001", "SEC001", "A11Y001",
  "WET001", "WET002", "WET003", "WET004", "AIM001", "AIM002", "AIM003", "AIM004", "AIM005", "MDS001",
  "MDS002", "MDS003", "MDS004", "MDS005", "CLM002", "TIM002", "TIM003", "TIM004", "TIM005", "RED002",
  "RED003", "RED004", "RED005", "RED006", "EPI001", "EPI002", "EPI003", "EPI004", "EPI005", "EPI006",
  "EPI007", "EPI008", "EPI009", "EPI010", "EPI011", "EPI012", "WFA001", "WFA002", "WFA003", "WFA004",
  "WFA005", "WFA006", "AFA001", "AFA002", "AFA003", "AFA004", "AFA005", "MFA001", "MFA002", "MFA003",
  "MFA004", "MFA005", "APP001", "APP002", "APP003", "APP004", "APP005", "MOD001", "MOD002", "MOD003",
  "MOD004", "MOD005", "REP002", "REP003", "REP004", "REP005", "REP006", "RES001", "RES002", "COV003",
  "COV004", "COV005", "COV006", "WRK004", "WRK005", "WRK006", "MNF001", "MNF002", "MNF003", "MNF004",
  "MNF005",
] as const;

export const COMPILED_ATTESTATION_RULE_IDS = ["ATT001"] as const;
export const COMPILED_EXTERNAL_ARTIFACT_RULE_IDS = ["SEC001", "A11Y001"] as const;
export const COMPILED_SEMANTIC_RULE_IDS = COMPILED_RULE_IDS.filter(
  (id) => !COMPILED_ATTESTATION_RULE_IDS.includes(id as "ATT001") &&
    !COMPILED_EXTERNAL_ARTIFACT_RULE_IDS.includes(id as "SEC001" | "A11Y001"),
);

export interface CompiledOverlayBinding {
  overlayId: string;
  domain: string;
  payloadSchemaId: string;
  contractHash: Sha256Hash;
  implementation: "domain-pack-v1";
}

export const COMPILED_OVERLAY_BINDINGS: readonly CompiledOverlayBinding[] = [
  {
    overlayId: "wet-lab-1",
    domain: "wet_lab",
    payloadSchemaId: "https://schemas.report-prompt.org/v1/packs/wet-lab.schema.json",
    contractHash: "sha256:13448df55cb3f323d54b75ba29ca19689560cccddf759848b315c543dbfda651",
    implementation: "domain-pack-v1",
  },
  {
    overlayId: "ai-ml-1",
    domain: "ai_ml",
    payloadSchemaId: "https://schemas.report-prompt.org/v1/packs/ai-ml.schema.json",
    contractHash: "sha256:1fa8deb9e5da2aea709dbc5a87ac178ebebfd2fde3e8d9e0c27878f10b6febb0",
    implementation: "domain-pack-v1",
  },
  {
    overlayId: "molecular-dynamics-1",
    domain: "molecular_dynamics",
    payloadSchemaId: "https://schemas.report-prompt.org/v1/packs/molecular-dynamics.schema.json",
    contractHash: "sha256:7559ac192be5bb03276884ca30517ce2ac64e34e40e7d00b27049939d86a30c0",
    implementation: "domain-pack-v1",
  },
] as const;

export const COMPILED_RULE_SUPPORT_MANIFEST = {
  manifest_id: "report-prompt-compiled-rule-support",
  manifest_version: "1.0.0",
  registry_contract_hash: COMPILED_RULE_REGISTRY_HASH,
  semantic_rule_ids: COMPILED_SEMANTIC_RULE_IDS,
  attestation_rule_ids: COMPILED_ATTESTATION_RULE_IDS,
  external_artifact_rule_ids: COMPILED_EXTERNAL_ARTIFACT_RULE_IDS,
  overlay_bindings: COMPILED_OVERLAY_BINDINGS,
} as const;

export const COMPILED_RULE_SUPPORT_MANIFEST_HASH = sha256CanonicalJson(COMPILED_RULE_SUPPORT_MANIFEST);

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Fail closed unless every executable-looking registry and overlay field is the
 * exact contract for which the shipped evaluators were compiled. Conditions
 * are not decorative input: changing any byte-level YAML meaning after parse
 * requires an explicit support-manifest/code update.
 */
export function assertCompiledRuleContracts(
  registry: RuleRegistry,
  overlays: readonly DomainOverlay[] = [],
): void {
  const ids = registry.rules.map((rule) => rule.id);
  if (!sameOrderedStrings(ids, COMPILED_RULE_IDS)) {
    throw new Error("Rule registry does not match the compiled support manifest rule ids/order");
  }
  const registryHash = sha256CanonicalJson(registry);
  if (registryHash !== COMPILED_RULE_REGISTRY_HASH) {
    throw new Error(`Rule registry contract hash ${registryHash} does not match compiled support ${COMPILED_RULE_REGISTRY_HASH}`);
  }
  const bindings = new Map(COMPILED_OVERLAY_BINDINGS.map((binding) => [binding.overlayId, binding]));
  for (const overlay of overlays) {
    const binding = bindings.get(overlay.overlay_id);
    if (binding === undefined) throw new Error(`Domain overlay ${overlay.overlay_id} has no compiled support binding`);
    const hash = sha256CanonicalJson(overlay);
    if (hash !== binding.contractHash || overlay.domain !== binding.domain || overlay.payload_schema_id !== binding.payloadSchemaId) {
      throw new Error(`Domain overlay ${overlay.overlay_id} does not match its compiled support binding`);
    }
  }
}
