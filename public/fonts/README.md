# Bundled fonts

The web app uses self-hosted **Poppins**, matching the MoFlo Cloud workspace
Figma audit's app typography. Its font stack falls back to locally available
Kanit, Helvetica, Arial, and sans-serif; the app makes no third-party font requests.

Poppins Regular (400), Medium (500), SemiBold (600), and Bold (700) are unmodified
TrueType files from the official [Google Fonts repository](https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/poppins),
pinned to commit `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`.
Copyright 2020 The Poppins Project Authors. Their SIL Open Font License 1.1 is
included in [Poppins-OFL.txt](Poppins-OFL.txt).

| File | SHA-256 |
| --- | --- |
| Poppins-Regular.ttf | `7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba` |
| Poppins-Medium.ttf | `90373e7d838d32468438fc3e152dca0bdb12edcab99ea639f158790b1ba1fd05` |
| Poppins-SemiBold.ttf | `d3bf1bdaf0550e83da9ac0b1d1d9fe6db086835a83aa28578e609a394b9a0286` |
| Poppins-Bold.ttf | `983676516167748b74de6f4771fb384c664fd913acb8b471122ecacf5da5ea6c` |

The existing **Noto Sans** Regular and Bold files remain available for server-side
PDF exports. Copyright 2018 The Noto Project Authors; their SIL Open Font License
1.1 remains in [OFL.txt](OFL.txt). Changing the app font does not change PDF export
typography or its font coverage.
