# Dhikr Autopilot: setup guide

This makes a dhikr counter video (3 zikar with translation and pronunciation) and posts it to your YouTube channel by itself, every 2 hours. It runs on GitHub's free servers, so your phone does not need to stay on. Your phone is only the remote control.

You do the setup once. About 30 minutes. Part B is easier on a PC.

---

## A. GitHub (phone is fine)

1. Make a free account at github.com.
2. Create a new repository called `dhikr-autopilot`.
   - **Public** is best: GitHub Actions is then free with no minute limit. Nothing secret is stored in the files.
   - Private also works (2,000 free minutes a month, enough for about 6 posts a day).
3. Make a token: Settings, Developer settings, Personal access tokens, **Tokens (classic)**, Generate new token (classic). Tick **repo** and **workflow**. Copy it.
4. Open `dhikr-autopilot-setup.html` in your phone's browser, paste the token, type the repository name, tap **Install**. It puts all the files into your repository.

## B. YouTube access (once)

1. Go to console.cloud.google.com and create a project.
2. APIs and Services, Library, find **YouTube Data API v3**, tap **Enable**.
3. APIs and Services, **OAuth consent screen**: choose External, give it any name, add your own email. Then tap **Publish app** so it is "In production".
   - If you leave it on "Testing", your access expires every 7 days and the bot stops.
4. Credentials, Create credentials, **OAuth client ID**, type **Web application**. Under Authorized redirect URIs add exactly:
   `https://developers.google.com/oauthplayground`
   Copy the **Client ID** and **Client secret**.
5. Open developers.google.com/oauthplayground
   - Tap the gear icon, tick **Use your own OAuth credentials**, paste the Client ID and secret.
   - In the box on the left type `https://www.googleapis.com/auth/youtube.upload` and tap **Authorize APIs**.
   - Sign in with the Google account that owns your channel. Google shows an "unverified app" warning because it is your own app: tap Advanced, then continue.
   - Tap **Exchange authorization code for tokens** and copy the **Refresh token**.
6. In your GitHub repository: Settings, Secrets and variables, Actions, New repository secret. Add these:

   | Name | Value |
   |---|---|
   | `YT_CLIENT_ID` | the Client ID |
   | `YT_CLIENT_SECRET` | the Client secret |
   | `YT_REFRESH_TOKEN` | the Refresh token |
   | `OPENAI_API_KEY` | optional: lets ChatGPT choose the zikar and the title |

   For Claude instead, add `ANTHROPIC_API_KEY` and choose Claude in the control page settings. With no AI key, the bot simply picks at random from your library.
7. Open the **Actions** tab of your repository and tap the green button if GitHub asks you to enable workflows.

## C. Test it

1. Open the control page (`docs/index.html`, or the `dhikr-control-panel.html` file). Enter `yourname/dhikr-autopilot` and your token.
2. Tap **Test (no upload)**. After about 3 minutes, open the finished run in the Actions tab and download the **video** file at the bottom. Watch it.
3. Tap **Post a video now**. Check your channel after 3 to 4 minutes.
4. After that it posts by itself. The control page shows the next post time, recent videos, and lets you pause, change settings, or switch zikar on and off.

---

## Things you should know

**Videos may be Private at first.** YouTube locks videos uploaded through a new API project to **Private** until the project passes Google's compliance review. Search for "YouTube API Services Audit and Quota Extension Form" and submit it. Until it is approved, you can make the videos public by hand in YouTube Studio.

**Daily upload limit.** YouTube gives a new project 10,000 quota units a day and one upload costs 1,600, so about **6 uploads a day**. Posting every 2 hours would be 12 a day. The bot posts up to 6, then waits for the limit to reset at midnight Pacific time. To spread posts across the whole day, set "Post every" to 4 hours. The same form can ask for a higher limit.

**Timing.** GitHub runs scheduled jobs a few minutes late, sometimes more. GitHub also pauses scheduled jobs if a repository has no activity for 60 days. The bot's own history updates count as activity.

**Check the zikar yourself.** The Arabic comes from `data/zikar.json`. The AI only chooses which ones to use and never writes Arabic. I wrote the list from well-known adhkar, but please check every Arabic text and translation against a source you trust before posting, and untick or add your own in the control page.

**Variety and YouTube rules.** YouTube can limit channels that post very repetitive, mass-produced videos. The bot varies the zikar, scene, colours and sound each time. Check your channel now and then.

**Keep your token private.** The GitHub token is stored only in your phone's browser. You can delete it any time at github.com/settings/tokens.

## If something goes wrong

Open the failed run in the Actions tab; the last red step says why. The usual causes:

- `invalid_grant`: the YouTube refresh token expired. Usually the consent screen was left on Testing. Publish it, make a new refresh token, update the `YT_REFRESH_TOKEN` secret.
- `quotaExceeded`: the daily limit was used. It resets at midnight Pacific time.
- `OpenAI 401`: wrong `OPENAI_API_KEY`. The bot still posts, using a random pick.
- Control page says 404: the token is missing the **repo** or **workflow** permission.
