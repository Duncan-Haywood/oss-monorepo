// SNS mobile push. A native app registers its device token after sign-in; the app sends to a user.
// platformApps: { apns: "<platform application ARN>", apns_sandbox: "...", fcm: "..." } (only those configured).
import { CreatePlatformEndpointCommand, PublishCommand, DeleteEndpointCommand } from "@aws-sdk/client-sns";

export function makePush({ pool, sns, platformApps, userSub }) {
  return {
    async register(platform, token) {
      if (!userSub) throw new Error("sign-in required");
      const appArn = platformApps[platform];
      if (!appArn) throw new Error(`push platform not configured: ${platform}`);
      if (!/^[A-Za-z0-9:_\-.]{16,4096}$/.test(String(token))) throw new Error("bad device token");
      const r = await sns.send(new CreatePlatformEndpointCommand({ PlatformApplicationArn: appArn, Token: token, CustomUserData: userSub }));
      await pool.query(
        `INSERT INTO platform.push_devices (user_sub, platform, device_token, endpoint_arn) VALUES ($1, $2, $3, $4)
         ON CONFLICT (platform, device_token) DO UPDATE SET user_sub = EXCLUDED.user_sub, endpoint_arn = EXCLUDED.endpoint_arn`,
        [userSub, platform, token, r.EndpointArn],
      );
      return r.EndpointArn;
    },
    /** Sends `{ title, body, data }` to every device of a user. Returns the number delivered to SNS. */
    async send(toUserSub, { title, body, data = {} }) {
      const { rows } = await pool.query(`SELECT platform, endpoint_arn FROM platform.push_devices WHERE user_sub = $1`, [toUserSub]);
      let sent = 0;
      for (const d of rows) {
        const payload = d.platform === "fcm"
          ? { GCM: JSON.stringify({ notification: { title, body }, data }) }
          : { [d.platform === "apns" ? "APNS" : "APNS_SANDBOX"]: JSON.stringify({ aps: { alert: { title, body } }, ...data }) };
        try {
          await sns.send(new PublishCommand({ TargetArn: d.endpoint_arn, MessageStructure: "json", Message: JSON.stringify({ default: body, ...payload }) }));
          sent++;
        } catch (e) {
          if (e?.name === "EndpointDisabledException") {  // uninstalled app: forget the device
            await sns.send(new DeleteEndpointCommand({ EndpointArn: d.endpoint_arn })).catch(() => {});
            await pool.query(`DELETE FROM platform.push_devices WHERE endpoint_arn = $1`, [d.endpoint_arn]);
          } else throw e;
        }
      }
      return sent;
    },
  };
}
