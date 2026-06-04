import type { PermissionRequest } from "../lib/types";
import { t } from "../lib/i18n";

export default function PermissionPrompt({
  req, onRespond,
}: { req: PermissionRequest; onRespond: (r: "once" | "always" | "reject") => void }) {
  const detail = (req.patterns && req.patterns.join(", ")) || (req.tool ? "call " + req.tool.callID : "");
  return (
    <div className="perm-block">
      <div className="h">{t("perm.title")}: {req.permission || "action"}</div>
      {detail && <div className="d">{detail}</div>}
      <div className="row">
        <button className="allow" onClick={() => onRespond("once")}>{t("perm.allow")}</button>
        <button className="always" onClick={() => onRespond("always")}>{t("perm.always")}</button>
        <button className="reject" onClick={() => onRespond("reject")}>{t("perm.deny")}</button>
      </div>
    </div>
  );
}
