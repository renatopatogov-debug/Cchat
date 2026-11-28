import { Code2, FileText, LifeBuoy, Mail, Shield } from "lucide-react";
import { useContext } from "react";

import { CchatLogo } from "@/components/brand/CchatLogo";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsSection";
import { SettingsSearchingContext } from "@/components/settings/settingsNav";
import { FormattedMessage, useIntl } from "@/i18n";
import { appVersionLabel } from "@/lib/appVersion";
import { SUPPORT_EMAIL } from "@/lib/platform";

/** Settings › Help & support. */
export function SupportSettings() {
  const intl = useIntl();
  return (
    <SettingsGroup id="support">
      <SettingsRow
        icon={LifeBuoy}
        tone="success"
        label={intl.formatMessage({ id: "aboutSettings.helpSafety", defaultMessage: "Help & safety" })}
        description={intl.formatMessage({
          id: "aboutSettings.helpSafetyDescription",
          defaultMessage: "Blocking, hiding, muted words, reporting and getting help.",
        })}
        to="/support"
      />
      <SettingsRow
        icon={Mail}
        tone="accent2"
        label={intl.formatMessage({ id: "aboutSettings.contactSupport", defaultMessage: "Contact support" })}
        description={intl.formatMessage(
          {
            id: "aboutSettings.contactSupportDescription",
            defaultMessage: "Report inappropriate activity or ask for help at {email}.",
          },
          { email: SUPPORT_EMAIL },
        )}
        href={`mailto:${SUPPORT_EMAIL}`}
        chevron
      />
    </SettingsGroup>
  );
}

/** Settings › About Cchat: version, legal pages, and AGPL-3.0 upstream credits. */
export function AboutSettings() {
  const intl = useIntl();
  const searching = useContext(SettingsSearchingContext);
  return (
    <>
      {!searching && (
        <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
          <CchatLogo size={64} />
          <div className="text-lg font-bold tracking-tight">Cchat</div>
          <div className="text-xs text-muted-foreground">
            <FormattedMessage id="aboutSettings.tagline" defaultMessage="Private communities that need no host." />
          </div>
        </div>
      )}

      <SettingsGroup id="about">
        <SettingsRow
          label={intl.formatMessage({ id: "aboutSettings.version", defaultMessage: "Version" })}
          value={<span className="tabular-nums">{appVersionLabel()}</span>}
        />
        <SettingsRow
          icon={Code2}
          tone="primary"
          label={intl.formatMessage({ id: "cchat.about.sourceLabel", defaultMessage: "Source Code & Credits (AGPL-3.0)" })}
          description={intl.formatMessage({
            id: "cchat.about.sourceDesc",
            defaultMessage: "Built on the open-source Armada (Soapbox) codebase under GNU AGPL-3.0.",
          })}
          href="https://github.com/soapbox-pub/armada"
          chevron
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon={FileText}
          tone="muted"
          label={intl.formatMessage({ id: "aboutSettings.terms", defaultMessage: "Terms of service" })}
          to="/terms"
        />
        <SettingsRow
          icon={Shield}
          tone="muted"
          label={intl.formatMessage({ id: "aboutSettings.privacyPolicy", defaultMessage: "Privacy policy" })}
          to="/privacy"
        />
      </SettingsGroup>
    </>
  );
}
