# ValidatePlaylist

## Introduction

ValidatePlaylist is a NodeJS application running on PP01 which is run periodically (every 10 minutes) via Task Scheduler. It reads Gallium playlists and compares them with schedules in WhatsOn. It then creates side-by-side HTML tables for each channel highlighting differences between WhatsOn and Gallium. This is used by operators to validate that Gallium playlists are in sync with WhatsOn.

ValidatePlaylist is **not** a critical application, so SCOM alerts need not be addressed immediately.

- **First responder**: Alastair MacMaster [ALAM] 
  - Investigate cause of crash, resolve and fix
- **Second responder**: Jabob Viggo Hansen [JVH] or Ole Kristensen [DREXOLEK]
  - Assuming Alastair is unavailable

---

## Application overview

- **Server**: PP01
- **Run via**: Terminal window (CMD)
- **Triggers**: Runs periodically (every 10 minutes)
- **Start in**: ```c:\node\ValidatePlaylist```
- **Execute**: ```node app.js```
- **User**: NET\svcPP01
- **HTML tables**:
    - ```\\pp01\system$\Monitoring\ValidatePlaylist\DR1_ValidatePlaylist.html```
    - ```\\pp01\system$\Monitoring\ValidatePlaylist\DR2_ValidatePlaylist.html```
    - ```\\pp01\system$\Monitoring\ValidatePlaylist\TVR_ValidatePlaylist.html```
    - ```\\pp01\system$\Monitoring\ValidatePlaylist\TSK_ValidatePlaylist.html```
    - ```\\pp01\system$\Monitoring\ValidatePlaylist\EVA_ValidatePlaylist.html```
    - ```\\pp01\system$\Monitoring\ValidatePlaylist\EVB_ValidatePlaylist.html```
    - ```\\pp01\system$\Monitoring\ValidatePlaylist\EVC_ValidatePlaylist.html```
- **Logs**: ```\\PP01\system$\Logs\ValidatePlaylist```
- **GitHub repo**: https://github.com/drdk/ValidatePlaylist.git
- **PDF source**: https://github.com/drdk/ValidatePlaylist/blob/main/README.md

---

## Failure resolution

If the ValidatePlaylist app fails to run, first check that the application is being triggered by Task Scheduler:

- Connect to PP01 via **PAM**
- Run **Task Scheduler** and select **ValidatePlaylist** in the applications list
- Click **Run** in the **Actions** panel.
- The status should show **Running** for a few seconds inside the application list if the application runs correctly - (you may need to click F5 to refresh) - and will then return to **Ready** after the application completes.
- If ValidatePlaylist failed to run, locate the last logfile and look for any obvious failure. The logfile should end with **Application completed successfully**

If the ValidatePlaylist application will **NOT** run after these steps, contact the second responder to help analyse the problem.

---

## Redundancy

PP01 is a virtual machine and so can be restarted quickly with files rolled back several days if necessary.
