# Clé de signature des APK de BÊTA — PUBLIQUE, NON SECRÈTE

`rupture-debug.keystore` est une **clé de débogage** (PKCS12, alias `rupturedebug`, mots de passe `android`,
valable 30 ans). Elle est **volontairement commitée et publique** : elle ne protège rien.
Empreinte SHA-256 du certificat :
`B5:DD:56:18:30:A2:31:7A:BF:C7:57:7E:52:35:CD:CD:2D:29:59:47:8F:41:4A:C9:A7:CA:17:91:8E:14:62:06`

Elle sert **UNIQUEMENT** à signer les APK de bêta fabriqués par `.github/workflows/android-apk.yml`
(variable `RUPTURE_BETA_SIGNING=1`, lue par `android/app/build.gradle`). Toujours la même signature d'un build
à l'autre = Android installe chaque nouvelle bêta **par-dessus** la précédente, sans désinstaller, donc
**sans perdre les parties**.

- Ne jamais la remplacer ni la régénérer : la bêta suivante refuserait de s'installer par-dessus.
- Ne jamais l'utiliser pour Google Play. La vraie clé d'importation restera dans les secrets GitHub, jamais ici.
