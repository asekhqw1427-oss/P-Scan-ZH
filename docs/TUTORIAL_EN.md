# Complete English Tutorial — P-Scan ZH 1.5.1

**Application language:** Traditional Chinese (zh-TW). **Publisher metadata:** Agent-QW1427.

This guide covers portable installation, calibration, operation, recovery, development, packaging and validation. Start in test mode: this rule-based prototype is not a certified production inspection system.

## 1. Requirements and scope

The portable application targets Windows x64. It runs offline without Python, Node.js or API keys. Use separate writable local NTFS folders for input and outputs; safe copying requires hard-link support.

Supported files: PNG, JPG/JPEG and BMP. Files must be nonempty and no larger than 30 MB. Images must have at least 80 pixels on the shorter side and at most 60 million pixels. Analysis scales the longest side to at most 1600 pixels. Area thresholds use analysis pixels, not camera pixels or micrometers.

The application finds circular and octagonal pads, inspects verified interiors, and has an additional large-dark-obstruction detector. It does not capture camera images, control a PLC, inspect PR residue, or include a trained PatchCore model.

## 2. Download and install

1. Open this repository's **Releases** page and download the Windows x64 portable ZIP when available. **Code → Download ZIP** contains source code, not the ready-to-run runtime.
2. Quit any old version completely using its system tray menu. Closing the window normally hides it.
3. Extract the entire portable archive into a new folder, for example `C:\Tools\P-Scan-ZH-1.5.1`.
4. Open `P-Scan-Defect.exe`. Keep the accompanying DLLs, `resources`, and `locales` folders beside it.
5. Begin with test mode and confirmed Good and NG images.

The EXE is unsigned. Follow organizational software approval procedures if Windows blocks it. Do not disable security software. CompanyName metadata is not a trusted digital signature.

## 3. Configure folders

| Purpose | Example | Chinese control |
| --- | --- | --- |
| Incoming originals | `C:\PScanData\Input` | 輸入資料夾 |
| Accepted originals | `C:\PScanData\Good` | Good（良品） |
| Defective originals | `C:\PScanData\NG-Defect` | NG-Defect（缺陷） |

Click **選擇** (Choose) for each folder. **建立結果資料夾** fills Good and NG-Defect paths under a selected parent. Input must exist. Output folders are created when settings are validated.

The three folders must not be identical, nested inside one another, or overlap the application data directory. Only files directly inside Input are monitored; subfolders are ignored.

Select **測試：記錄結果，不複製影像** (Test: record without copying) for initial calibration.

## 4. Inspect your first image

1. Choose **整張影像中的焊墊** to inspect pads throughout the image, or select a rectangular scope.
2. Click **03 · 測試影像／預覽** (Test image / Preview).
3. Select an original, unmarked image. Do not use a copy with a white circle drawn over the suspected defect.
4. Wait for classification and the annotated preview.
5. Check pad recognition and green interior boundaries before adjusting spot sensitivity.
6. Inspect every D and T box; use zoom for small features.
7. Repeat with both confirmed Good and NG samples.

Manual preview can inspect a file already in history. Automatic monitoring can skip completed unchanged files; use reset when restarting a complete batch.

## 5. Results, coverage and overlays

| Result | Meaning | Sorting action |
| --- | --- | --- |
| Good | No qualifying defect or blocking uncertainty in inspected interiors | Copy original to Good |
| NG-Defect | Verified spot or qualifying large dark obstruction | Copy original to NG-Defect |
| 待複核 / Review | Uncertain geometry, boundary candidates, marker occlusion, or no inspectable interiors | Hold for review |
| Processing failure | Technical failure rather than a valid quality decision | Check the error; never count as Good |

Classification and file-operation status are separate. An NG result can still have a copy conflict. Test mode never copies either classification.

**Partial Good policy:** a count mismatch, reference count of zero, or cropped pad alone does not prevent Good when at least one interior is inspected and there is no other blocking issue. Cropped pads are skipped. Good with partial coverage does not certify every pad or pixel. Uncertain boundaries, T candidates, relevant marker occlusion or zero inspected interiors still require Review. A verified defect can produce NG even when other areas are incomplete.

| Overlay | Meaning |
| --- | --- |
| Dashed pad outline | Recognized geometry |
| Solid green interior | Actual normal-spot inspection region |
| P1, P2, etc. | Pad identifiers |
| Asterisk beside pad ID | Cropped pad; interior skipped |
| Red D01, D02, etc. | Defect evidence |
| Orange T01, T02, etc. | Boundary-related evidence needing review |
| Blue rectangle | Selected rectangular inspection scope |

A large-dark box may appear where a pad outline is obscured. It does not invent a complete pad beneath the blob. Original output images stay unmarked; annotated previews are stored separately.

## 6. Settings reference

These are factory defaults; a retained configuration may differ.

| Chinese label | English meaning | Default | Effect |
| --- | --- | --- | --- |
| 操作模式 | Operation mode | Test | Automatic mode copies original files |
| 斑點靈敏度 | Spot sensitivity | 30 | Higher detects weaker contrast but may flag normal texture |
| 額外偵測遮蔽焊墊的大型深色污點 | Large dark obstruction detection | On | Independent large-blob path; requires at least three complete verified surrounding pads |
| 最小斑點面積（像素數） | Minimum connected spot area | 10 | Smaller values admit smaller components; analysis pixels |
| 檢測範圍 | Inspection scope | Full image | Full image or a rectangle |
| 左側／上方／寬度／高度 | Rectangle X/Y/width/height | 0/0/100/100% | Relative to top-left; rectangle must fit within image |
| 焊墊邊緣安全距離（%） | Interior inset | 10% | Higher shrinks inspected area and can exclude edge defects |
| 忽略長條黃色標記線 | Ignore long yellow marker lines | On | Masks annotation lines; small yellow dots remain eligible |
| 斑點明暗類型 | Spot polarity | Dark and bright | Dark, bright, or both; bright-only disables large-dark path |
| 最小直徑／最大直徑 | Pad diameter range | 3–16% | Percent of scope's shorter side; tune for magnification |
| 辨識靈敏度 | Pad recognition sensitivity | 60 | Affects pad search; verify resulting geometry |
| 對比閾值 | Pad contrast threshold | 14 | Adjust while checking recognition |
| 同一影像內的焊墊尺寸大致一致 | Similar pad sizes | On | Assumes roughly uniform pad size |
| 檢測範圍內的參考焊墊數量 | Reference pad count | 0 | Coverage information, not an automatic defect rule |
| 等待檔案穩定（秒） | Stable-file delay | 3 seconds | Range 2–60 seconds; allows file writing to finish |
| 登入 Windows 時啟動並開始監控 | Start at login | Off | Saved configuration and approval must be valid |

The large-dark detector has its own geometry-scaled thresholds. Changing small-spot sensitivity does not tune it. Thin tracks and edge-touching candidates are deliberately rejected. Too few surrounding pads, a very dark image, or an extended structure can cause misses.

## 7. Calibrate systematically

1. Gather representative known Good and NG images from the real acquisition setup. Include lighting variation, cropping, tiny spots, edge defects, and large dark blobs.
2. Validate pad recognition first. Tune the diameter range, scope and geometry only while checking the preview.
3. Confirm the defect lies inside a green inspected interior or qualifies for the independent large-dark path. A missed pad can make an obvious dark spot invisible to normal interior inspection.
4. Change one parameter at a time and compare the same samples.
5. Increase sensitivity or reduce minimum area cautiously for missed small defects. Recheck all Good samples for new false positives.
6. Inspect the inset: a large inset can hide edge defects; too little inset can admit ring artifacts.
7. Test the large-dark switch against both true blobs and normal dark patterns.
8. Reserve additional images not used for tuning. Evaluate the final configuration on this held-out set.
9. Check box localization, not just image classification. An NG result with a box on the wrong feature is not correct localization.
10. Preview final settings, check the calibration approval checkbox, and save.

Track false negatives, false positives, Review rate, and localization separately. Review is neither confirmed Good nor confirmed defect. Small development datasets do not establish production accuracy.

Changing detection parameters invalidates approval. **使用目前焊墊數量作為參考** changes the reference count, so preview again afterward.

## 8. Run automatic monitoring

1. Pause and wait for any active image to finish.
2. Select **自動：複製原始影像** (Automatic: copy originals).
3. Preview and approve current parameters if requested, then click **儲存設定**.
4. Click **04 · 開始背景掃描**.
5. Place finished images directly in Input. The folder is polled, stability checked, and images processed one at a time.
6. Watch Review, error and conflict records as well as Good/NG counts.

**暫停掃描** stops subsequent work; the active image may finish first. **縮小至系統匣** hides the window while monitoring continues. **結束** or the tray quit command exits fully. Sleep, logout and shutdown stop monitoring.

Source files are retained. Different contents under the same filename are never silently overwritten. A same-name file in the opposite category can also cause a conflict.

## 9. Reset and reprocess the same images

1. Pause and wait until idle.
2. Export CSV first if the current records must be retained.
3. Click **重設歷史紀錄** (Reset history).
4. Read and confirm the deletion dialog.
5. Press Start to scan Input from the beginning.

Reset deletes the internal journal, counters, previews and processed-file markers. It keeps input images, saved settings and existing output images. It remains paused until Start is pressed.

Use fresh empty output folders if new settings may change classifications; existing files can otherwise create conflicts. Identical content already present in the same category is reported as already present.

**重試擱置項目** retries held Review, conflict and error items. Fix their underlying cause first: retry alone does not change detection rules.

## 10. History, CSV and backup

The UI displays up to 150 recent records. **匯出 CSV** exports the latest record per processing key across the full journal, rather than only visible rows. It is not a complete append-only record of every intermediate retry event.

CSV uses UTF-8 with a BOM. Fields include time, filename, mode, file status, classification, pad/inspected/cropped counts, spots, large-dark candidates, Review candidates, coverage explanations, parameter/source SHA256 and destination.

Old saved records retain their original language. New descriptions and CSV headers use Traditional Chinese. Technical values such as Good, NG-Defect and COPIED remain unchanged.

Configuration, history and previews are stored in:

```text
%APPDATA%\P-Scan-Defect-ID
```

The legacy directory name intentionally preserves compatibility. Fully quit before backing up that folder. Back up Input and outputs separately. Do not commit operational images, histories or credentials to GitHub.

## 11. Troubleshooting

| Symptom | Check or action |
| --- | --- |
| EXE will not start | Extract every file; check Windows x64, organization approval and exact error |
| Old language appears | Fully quit old tray instance before starting new version |
| Start disabled | Save changed settings and wait for active preview/scan/reset |
| Calibration approval requested | Preview current settings, approve and save |
| Unchanged image skipped | Manual preview, retry held items, or reset entire history |
| Obvious dark defect missed | Pad recognition, green region, inset, polarity, scaling and three surrounding pads for large-dark detection |
| Clean images become NG | Inspect D boxes; compare sensitivity, area, inset, geometry and large-dark evidence |
| Many Review results | Inspect T boxes, uncertain boundaries, marker coverage and inspectable-pad count |
| No copies in test mode | Expected: switch to approved automatic mode for copying |
| Result exists but output absent | Check copy status, Review, conflict, already-present state and write errors |
| Filename conflict | Use a fresh output folder or resolve old output after review |
| Folder validation fails | Separate absolute paths, writable local NTFS and no nested/overlapping folders |
| Image incomplete | Wait for producer to finish; increase stability delay as appropriate |
| Scan timeout | Per-image limit is 180 seconds; narrow unnecessary scope/search range without losing target coverage |
| Reset unavailable | Pause and wait for current operations |
| CSV text garbled | Import as UTF-8 instead of a legacy code page |

Windows native dialogs, font layout and Defender behavior still need acceptance testing on the actual workstation.

## 12. Develop and test

Use Git and Node.js 24 on a development workstation. A private repository requires an authorized GitHub account.

```powershell
git clone https://github.com/asekhqw1427-oss/P-Scan-ZH.git
cd P-Scan-ZH
npm install
npm test
npm run test:zh
npm start
```

Installation downloads dependencies; inspection itself runs offline. This import has no lockfile, so use `npm install`, not `npm ci`.

| Command | Coverage |
| --- | --- |
| npm test | Core behavior, engine and image-format integrity |
| npm run test:zh | Simulated Chinese DOM, counters, preview, reset and publisher text |
| npm run test:folders | Additional fixture-based folder integration |
| npm run test:desktop | Optional real Electron test requiring a graphical desktop |

Historical localization testing passed 42 tests. A DOM simulation is not a rendered-layout test. Optional desktop testing remains unverified until run successfully on a suitable machine. Its language expectation has been corrected to zh-Hant.

| File or directory | Responsibility |
| --- | --- |
| app/main.js | Windows, IPC, tray, dialogs and CSV |
| app/core.js | Configuration, classification, monitoring, safe copy and journal |
| app/engine.js | Geometry, spots, boundary review and large-dark detection |
| app/ui.js, index.html, style.css | Traditional Chinese interface |
| app/scan.js, scan-worker.js | Decode, analyze and annotate |
| tests/fixtures | Synthetic samples, not production data |
| metadata.cjs | EXE resource edit and non-resource integrity checks |
| build-package.py | Repackaging from the prior Windows runtime |
| third-party | Electron and Chromium license notices |

The project declares UNLICENSED; uploading it does not grant an open-source license. Third-party licenses remain applicable.

## 13. Build a portable Windows package

The script is a **repackaging workflow**, not a clean installer builder. It requires the prior `P-Scan-Defect-1.5-Windows-x64-Indonesia.zip` with the known Electron 45.0.0 layout of 72 runtime files. Obtain this build input from the project owner; it is not automatically fetched.

Python 3 is needed only for packaging. Node.js dependencies are needed for the metadata tool.

1. Put the original ZIP outside the repository, e.g. in `C:\PScanBuild`.
2. Extract its original `P-Scan-Defect.exe` as `C:\PScanBuild\original.exe`.
3. From this repository root, run:

```powershell
node metadata.cjs C:\PScanBuild\original.exe C:\PScanBuild\P-Scan-Defect.exe C:\PScanBuild\metadata-verification.json
python build-package.py C:\PScanBuild\P-Scan-Defect-1.5-Windows-x64-Indonesia.zip C:\PScanBuild\P-Scan-Defect.exe C:\PScanBuild\output
```

4. Verify CompanyName Agent-QW1427 and version 1.5.1.0 in the generated metadata report.
5. Review packaging success: Windows/source ZIPs, Chinese guide, SHA256 records, CRC and content checks.
6. Extract the new package into a clean folder and validate on Windows before distribution.

The metadata tool edits version resources and checks unchanged non-resource sections. It does not sign the EXE. The scripts currently target 1.5.1; a future version requires coordinated changes to package versions, labels, metadata and output names.

Keep large ZIPs and executables in GitHub Release assets, not ordinary Git commits. The portable package includes `resources/app` and a developer source copy.

## 14. Publisher and signing

Product metadata and trusted publisher identity are different. The interface and EXE CompanyName say Agent-QW1427; SmartScreen's verified publisher comes from a trusted code-signing certificate's validated identity.

This build is unsigned and may show Unknown publisher. Signing can establish publisher identity but does not guarantee removal of reputation warnings. Use organizational signing infrastructure in a secure environment. Never upload private keys, PFX passwords or signing credentials to this repository or chat. Sign after editing resources; verify the signature and regenerate hashes after signing.

Official reference: https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation

## 15. Acceptance checklist

- Launch the complete extracted package on Windows and inspect Chinese text, fonts and dialogs.
- Confirm version and product metadata.
- Validate known Good/NG samples and exact locations of D boxes.
- Agree on partial-Good and cropped-pad handling with the responsible reviewer.
- Inspect Review/error cases in a test batch.
- Run a controlled automatic batch into empty outputs and verify source-byte preservation.
- Pause, reset and verify unchanged images are processed again.
- Export CSV and confirm readable Mandarin and meaningful status values.
- Test tray, full quit, restart recovery and login startup if enabled.
- Record configuration, dataset, misses, false alarms and workstation details.

Unit tests do not establish production inspection accuracy. Base operational approval on representative images and real-machine behavior.
