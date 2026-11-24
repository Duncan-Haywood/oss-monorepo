# Platform research: what iOS, HealthKit and ChatGPT allow (November 2026)

Each finding carries how it was established:

- **Verified (doc):** read in Apple's or OpenAI's documentation during this session; the source is linked.
- **Known (unverified here):** established platform behaviour from before this session that I could not re-read here (OpenAI's hosts were unreachable from the build container). Treat these as claims to check, and see `limitations.md`.
- **Needs a device:** only a real iPhone can settle it. The experiment that does is in `acceptance.md`.

## 1. Detecting a new photo

| Question | Finding | Status |
|---|---|---|
| Can an app be woken when a photo is taken? | No. PhotoKit does not report changes to a backgrounded or terminated app. An Apple engineer on the developer forums: "you will not be told about arbitrary changes via PhotoKit while your app is in the background or killed"; changes arrive together when the app returns to the foreground. | Verified (doc): [developer forums](https://developer.apple.com/forums/thread/833067), [observing changes](https://developer.apple.com/documentation/photokit/observing-changes-in-the-photo-library) |
| Can an app find everything added since it last looked, with no gaps? | Yes. `PHPhotoLibrary.fetchPersistentChanges(since:)` with a stored `PHPersistentChangeToken` (iOS 16+) returns inserted, updated and deleted identifiers. The token is `NSSecureCoding`, so it can be persisted. If history was pruned, the call throws `persistentChangeTokenExpired` and the app must fall back to a date query. | Verified (doc): [WWDC22 10132](https://developer.apple.com/videos/play/wwdc2022/10132/), [background uploads article](https://developer.apple.com/documentation/photokit/uploading-asset-resources-in-the-background) |
| Does limited photo access work? | No, not for this. Limited access only exposes the photos the person picked, so new Camera photos stay invisible. Full access (`.readWrite`, `.authorized`) is required. Apple's background-upload extension states the same requirement: "Your app must have full library access before enabling the extension." | Verified (doc) for the extension; the limited-access behaviour is Known |
| Is there a system-scheduled photo extension? | Yes, new in iOS 26.1. The Photos background resource upload extension (`PHBackgroundResourceUploadExtension`, superseded by the async `PHBackgroundResourceUploadJobExtension` in iOS 27) is launched by the system "when conditions allow, scheduling work based on factors such as network availability, power state, and device activity", "even when people switch to other apps or lock their devices". It creates upload jobs (a `URLRequest` per asset resource) that the system transfers. Info.plist: `EXExtensionPointIdentifier = com.apple.photos.background-upload` and a `BackgroundUploadURLBase`. It needs full library access. There is a runtime limit per invocation and backoff between attempts. Apple publishes no numbers for either, and does not say whether the extension may run arbitrary work such as on-device classification. | Verified (doc): [Uploading asset resources in the background](https://developer.apple.com/documentation/photokit/uploading-asset-resources-in-the-background), [PHAssetResourceUploadJob](https://developer.apple.com/documentation/photos/phassetresourceuploadjob) |
| Background App Refresh / BGProcessingTask | Opportunistic. The system decides when, and how often, from app usage, battery and network. The app cannot schedule a task for a set time. A safety net, not a trigger. | Known |
| Shortcuts personal automations | There is no "photo taken" trigger. There is an **App** trigger ("Camera is Opened / is Closed"). Since iOS 15.4 an automation can run without asking ("Ask Before Running" off) and without a banner ("Notify When Run" off). Users report this working for Camera automations, with occasional unreliability (for example, the App Switcher firing "is Closed"). Apple notes that automations touching sensitive data may still prompt. | Verified (doc): [Apple: enable or disable a personal automation](https://support.apple.com/guide/shortcuts/apd602971e63/ios), [MacRumors: notifications off](https://www.macrumors.com/how-to/turn-off-notifications-automations-shortcuts); reliability on current iOS: Needs a device |
| Can an automation run app code without opening the app? | Yes, through an App Intent with `openAppWhenRun = false`, which runs in the app's process in the background. The time allowed is short and not documented. | Known; budget: Needs a device |

**Consequence.** Nothing gives truly instant, guaranteed processing. The best achievable chain is:

1. **Camera-closed automation → App Intent.** Near-real-time: it runs as the person leaves the Camera. It costs one-time setup and no recurring action.
2. **Persistent change token.** Exactness: every photo since the last run, whatever woke the app.
3. **Background refresh and processing tasks, plus foreground launches.** Eventual catch-up when the automation didn't fire.
4. **iOS 26.1+ background upload extension.** A candidate for fully system-scheduled processing with no Shortcuts setup, once its limits are measured. See ADR "Revisit when".

## 2. Telling food from everything else on device

| Question | Finding | Status |
|---|---|---|
| Free on-device image classification | `VNClassifyImageRequest` (Vision, iOS 13+) labels images against Apple's built-in taxonomy of about 1,300 classes, which includes food and drink classes. It needs no model download and makes no network call. | Known; class names to tune with `supportedIdentifiers()` on a device |
| Nutrition labels | `VNRecognizeTextRequest` (fast mode) on images that classify as documents: three or more of "nutrition facts / calories / protein / total fat / serving size..." marks a label. | Known |
| Screenshots and downloads | `PHAsset.mediaSubtypes.contains(.photoScreenshot)` flags screenshots. A missing camera EXIF block (TIFF Make plus an exposure time) marks saved or downloaded images. | Known |
| On-device nutrition estimation (Architecture B) | Apple's Foundation Models framework (iOS 26) exposes an on-device language model. I found no evidence that it accepts images from third-party apps, and a ~3B-parameter model is not a credible portion estimator. Not viable for stage 2 today. | Known (could not re-verify image input); revisit yearly |

## 3. Apple Health

| Question | Finding | Status |
|---|---|---|
| Types | `dietaryEnergyConsumed` (kcal), `dietaryProtein`, `dietaryCarbohydrates`, `dietaryFatTotal`, `dietaryFiber`, `dietarySugar`, `dietaryFatSaturated` (g), `dietarySodium` (mg) are `HKQuantityTypeIdentifier`s. A food correlation (`HKCorrelationType(.food)`) can group them. | Known |
| Corrections without duplicates | `HKMetadataKeySyncIdentifier` + `HKMetadataKeySyncVersion`: "When a new object is saved, it overrides existing objects that share the same identifier but carry a lower version number." When a deletion record is created, only these two keys are copied to it. This is exactly the replace-on-correction primitive this system needs. | Verified (doc): [sync identifier](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier), [sync version](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncversion) |
| Deleting our own samples | `HKHealthStore.deleteObjects(of:predicate:)` with `HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues:)`. Apps can only delete samples they wrote. | Known |
| Writing while locked | The HealthKit store is unavailable while the device is locked (`errorDatabaseInaccessible`). Background writes therefore have to be deferred and retried. The Camera-closed wake happens while the phone is unlocked, which helps. | Known |
| Writing from a server | Not possible. HealthKit lives on the device (and syncs through iCloud). Every write has to come from the app on the phone. | Known |
| Time zones | `HKMetadataKeyTimeZone` stores the zone of the meal so Health shows local time after travel. | Verified (doc): [time zone key](https://developer.apple.com/documentation/healthkit/hkmetadatakeytimezone) |

## 4. ChatGPT

| Question | Finding | Status |
|---|---|---|
| Custom MCP servers in ChatGPT | ChatGPT's developer mode (beta since 10 September 2025) adds remote MCP servers (SSE or streamable HTTP) as apps/connectors with read **and write** tools. Write tools need confirmation by default, and tools without a read-only annotation are treated as writes. | Verified (doc, via search results): [InfoQ](https://www.infoq.com/news/2025/10/chat-gpt-mcp), [OpenAI developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode.md) (unreachable from here) |
| Does ChatGPT **Plus** get write tools? | **Unresolved.** Launch coverage said Plus and Pro on the web. OpenAI's current help page reportedly limits full MCP (write actions) to Business, Enterprise and Edu. Third-party 2026 guides disagree. | Search results only: [OpenAI help 12584461](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt), [tokenrip](https://tokenrip.com/blog/add-mcp-to-chatgpt), [coworker.ai](https://coworker.ai/blog/chatgpt-mcp). The owner must check this in their own account |
| In the iOS ChatGPT app? | No source found that confirms developer-mode connectors in the mobile app; they are set up on the web. | Unresolved |
| Auth | ChatGPT connectors use OAuth 2.1, discovered through protected-resource metadata, with dynamic client registration; or no auth. | Known (matches MCP's authorization spec) |
| Fallback that works on Plus and on iPhone | A **Custom GPT with Actions** (OpenAPI + bearer API key or OAuth). Custom GPTs with Actions work for paid plans and in the mobile apps, and Actions can call POST endpoints, so they can write. | Known; the server serves `/openapi.json` for it |
| Alternative assistant | Claude's custom connectors take a remote MCP URL with OAuth, and connectors added on the web are used from the Claude mobile apps. The same `/mcp` endpoint works there. | Known |

**Consequence.** The server speaks MCP *and* exposes the same tools as REST with an OpenAPI document. Whichever ChatGPT path the owner's plan allows, the records, the tools and the semantics are the same.

## 5. Nutrition estimation

- No published evaluation in this repository yet measures the analyzer's accuracy. Photo-based energy estimates are commonly off by 20% or more per meal; label and weighed values are much better. The system therefore stores a source per item (`estimate`, `label`, `reference`, `user`, `chat_estimate`) and an energy range per meal, and keeps provisional meals out of totals.
- USDA FoodData Central is the authoritative open database (an API key is free). The server ships a six-food reference table rounded from SR Legacy for instant chat corrections. A full FDC lookup is on the plan (`implementation-plan.md`, P2).
