# Validation and limitations — P-Scan ZH 1.5.1

The localization build passed 42 automated tests (25 core, 13 engine, 4 image-format integrity). `test-results.txt` contains that recorded run. A simulated DOM check covered Chinese UI initialization, history, counts, preview, reset and publisher text.

EXE resources were read back as CompanyName Agent-QW1427 and version 1.5.1.0. Fourteen non-resource sections matched the original executable; the other 71 runtime files were retained. ZIP CRC and content hashes were checked.

No direct Windows execution, native-dialog/font visual testing, Defender verification, trusted signing, or new held-out real-image accuracy evaluation was performed. There is no PatchCore, PR-residue, camera or PLC implementation.

The GitHub import organizes English documentation and corrects the optional desktop test language expectation from id to zh-Hant. It does not change detection algorithms. Optional desktop testing remains unverified until run successfully on a graphical machine.
