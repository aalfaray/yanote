; "Abrir con yanote" in the Explorer context menu (per user, no admin needed).
; electron-builder includes build/installer.nsh automatically in the NSIS installer.

!macro yanoteMenuEntry KEY ARG
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\yanote" "" "Abrir con yanote"
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\yanote" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\yanote\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "${ARG}"'
!macroend

!macro customInstall
  ; right-click on a folder
  !insertmacro yanoteMenuEntry "Directory" "%1"
  ; right-click on the empty space inside a folder
  !insertmacro yanoteMenuEntry "Directory\Background" "%V"
  ; right-click on a drive
  !insertmacro yanoteMenuEntry "Drive" "%1"
  ; right-click on a Markdown file
  !insertmacro yanoteMenuEntry "SystemFileAssociations\.md" "%1"
  !insertmacro yanoteMenuEntry "SystemFileAssociations\.markdown" "%1"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\yanote"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\yanote"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\yanote"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.md\shell\yanote"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\yanote"
!macroend
