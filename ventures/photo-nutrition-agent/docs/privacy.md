# Privacy: where each piece of data goes

You run every component yourself; this project operates no service and receives nothing.

| Data | Where it goes | How long |
|---|---|---|
| Photos the on-device classifier judges not food | Nowhere. Classified on the iPhone and never read again | n/a |
| Likely food photos | Your server, downscaled to about 1024 px and re-encoded as JPEG **without EXIF/GPS**. Your server forwards the image to the vision API you configured (OpenAI by default, under its API data terms) | On your server: 3 days by default (`image_retention_days`; 0 = deleted right after analysis). Photos judged not to be food are deleted at once |
| Meal records, targets, profile, DEXA values, daily Health aggregates (weight, body fat, energy, steps, sleep, workouts) | Your server's SQLite file | Until you delete or erase them |
| Nutrition samples | Apple Health on your iPhone (and iCloud, if Health sync is on) | Until deleted |
| Chat requests | The ChatGPT/Claude account you connect reads and writes records through the tools you approve | Per that provider's terms |

Not collected: no analytics, no tracking, no third-party SDKs in the app or server. The server logs errors to stdout only.

Controls: pause on the phone or from chat (`policy.paused`), revoke iOS permissions at any time, export or erase from the server (`install.md`), rotate tokens to cut off any client.

Security: all traffic should be HTTPS (put the server behind TLS). Chat clients use OAuth 2.1 with PKCE or a bearer token; the phone uses its own device token; tokens are compared in constant time and OAuth tokens are stored hashed; ten wrong passwords lock the authorize page for 15 minutes. Use an encrypted disk for the database.
