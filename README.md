# P-Scan ZH

**Offline pad-defect inspection for Windows · Traditional Chinese interface · English documentation**

Application version: **1.5.1** · Publisher metadata: **Agent-QW1427**

P-Scan ZH inspects image files for spots inside recognized circular or octagonal pads. It provides manual previews, numbered defect boxes, background folder monitoring, original-image sorting, CSV export, and a history reset function.

**Start with the [complete English tutorial](docs/TUTORIAL_EN.md).** A [Traditional Chinese guide](docs/使用說明-繁體中文.md) is also included.

## What the application does

- Reads PNG, JPG/JPEG, and BMP files.
- Recognizes pad geometry and checks verified interior regions.
- Flags dark/bright spots and large compact dark obstructions.
- Separates **Good**, **NG-Defect**, **Review**, and processing failures.
- Copies original images into Good or NG-Defect folders in automatic mode; annotated previews are stored separately.
- Preserves filenames and source bytes, and prevents overwriting different content under the same filename.
- Supports restarting inspection of unchanged images using **重設歷史紀錄** (Reset history).

## What it does not do

This is a rule-based inspection prototype, not a trained PatchCore model. It does not inspect PR residue, operate a camera/frame grabber/PLC, or certify manufacturing quality. A Good result applies only to inspected interiors. Cropped pads are skipped; count mismatch or cropping alone does not block Good when an interior has been inspected without other blocking uncertainty.

## Run the portable Windows application

If a portable ZIP is attached to a repository release, download that Windows x64 ZIP. GitHub's **Code → Download ZIP** downloads source code, not the ready-to-run Windows runtime.

1. Fully quit the old application from its system tray menu.
2. Extract the entire portable ZIP into a new folder.
3. Run `P-Scan-Defect.exe`.
4. Begin in test mode and validate confirmed Good and NG images before automatic sorting.

Portable operation does **not** require Python, Node.js, an API key, or an Internet connection. Existing settings/history are retained in `%APPDATA%\P-Scan-Defect-ID`.

## Run from source

Use a Windows x64 development machine with Git and Node.js 24. The desktop runtime is pinned in `package.json`.

```powershell
git clone https://github.com/asekhqw1427-oss/P-Scan-ZH.git
cd P-Scan-ZH
npm install
npm test
npm run test:zh
npm start
```

A private repository requires GitHub access. Dependency installation downloads packages; application inspection itself runs offline. The project currently uses `npm install`, not `npm ci`, because this import does not contain a lockfile.

## Documentation

| Document | Purpose |
| --- | --- |
| [Full English tutorial](docs/TUTORIAL_EN.md) | Operator workflow, calibration, all settings, recovery, developer setup and packaging |
| [Validation and limitations](docs/VALIDATION_EN.md) | What was tested and what remains unverified |
| [Traditional Chinese guide](docs/使用說明-繁體中文.md) | Operator reference in the application language |
| [Third-party notices](third-party/) | Electron and Chromium licenses |

## Publisher and signing

The interface and EXE CompanyName metadata use **Agent-QW1427**. The supplied build is **unsigned**. Metadata is not a digital signature: Windows SmartScreen may still show **Unknown publisher**. A verified publisher requires a trusted code-signing certificate whose validated identity determines the displayed name. Signing does not guarantee that reputation warnings disappear.

See [Microsoft's SmartScreen guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation).

## Validation status

The 1.5.1 localization passed 42 automated tests, a simulated DOM check, and executable-resource integrity checks. The desktop application has not been directly validated on Windows in the build environment. No new accuracy claim is made by this language update. See [validation details](docs/VALIDATION_EN.md).

## Licensing

The application package declares `UNLICENSED`; this repository does not grant an open-source license for the project code. Third-party components retain their respective licenses. Do not commit production images, credentials, signing keys, or runtime user history.
