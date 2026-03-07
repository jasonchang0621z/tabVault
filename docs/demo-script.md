# TabVault Demo Recording Script

> Recording tool: macOS `Cmd + Shift + 5` or OBS
> Target length: 30-45 seconds
> Resolution: 1280x800

---

## Prep (before recording)

1. Open Chrome, make sure TabVault is loaded
2. Open 5-6 tabs from different sites:
   - github.com
   - stackoverflow.com
   - react.dev
   - tailwindcss.com
   - developer.mozilla.org
3. Group 3 of them into a tab group named "Frontend" (right-click tab → Add to group)
4. Group 2 others into a tab group named "Reference"
5. Delete any saved workspaces in TabVault so it starts clean

---

## Recording

### Scene 1: The Problem (5s)
- Show the Chrome window with 6+ tabs and 2 tab groups
- Briefly hover over the tabs to show how many are open

### Scene 2: Save (8s)
- Click the TabVault icon in the toolbar
- Popup opens showing empty state
- Click **"Save Current"**
- Type `My Research Project`
- Click **Save**
- Toast shows "Workspace saved"
- Workspace appears in the list with tab count

### Scene 3: Close & Switch (5s)
- Close the popup
- Close all tabs (Cmd+W repeatedly or close the window)
- Open a new blank window — show that the tabs are "gone"

### Scene 4: Restore (10s)
- Click the TabVault icon again
- The saved workspace is shown in the list
- Click the workspace card to restore
- New window opens with all tabs restored
- Show that tab groups are back with correct colors and names

### Scene 5: Pro Features (8s)
- Click the TabVault icon
- Click the **gear icon** to open Settings
- Show the settings panel — point out Export/Import and Auto-backup (greyed out for free)
- Click back, then click **"Unlock Pro"**
- Show the Pro dialog with the $2 purchase button
- Press Escape to close

### End (3s)
- Show the final state with all tabs restored
- Fade out

---

## Post-production tips

- Use iMovie or ScreenFlow to add:
  - Zoom-in on the popup when clicking
  - Captions for key actions ("Save", "Restore", "Pro")
  - Background music (optional, keep it subtle)
- Export as MP4 (H.264) for Chrome Web Store
- Export as GIF (max 15s loop) for README

### FFmpeg: Convert MP4 to GIF
```bash
ffmpeg -i demo.mp4 -vf "fps=15,scale=600:-1:flags=lanczos" -t 15 demo.gif
```
