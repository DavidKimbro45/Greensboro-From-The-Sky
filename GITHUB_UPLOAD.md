# GitHub publication pending

The project is built and committed locally. The signed-in GitHub account is `DavidKimbro45`, but GitHub rejected `CreateRepository` because the connected credentials do not have permission to create repositories. No remote repository was created and no code was pushed.

Create an empty **private** repository at https://github.com/new (suggested name: `guilford-gods-eye`), grant the GitHub connection access to it, and send its URL back in the conversation. The existing local checkout can then be pushed without rebuilding the project.

If publishing yourself from the source ZIP, extract it and run:

```sh
git init -b main
git add .
git commit -m "Initial Guilford County God's Eye dashboard"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Preserve LICENSE, THIRD_PARTY_NOTICES.md and UPSTREAM.md. Do not commit `.env`, credentials, node_modules, caches or runtime logs.
