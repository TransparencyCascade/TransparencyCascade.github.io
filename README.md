# Transparency Cascade Press Website

Landing page for Transparency Cascade Press, LLC.

## Sites

| Domain | Purpose |
|--------|---------|
| transparencycascade.org | This landing page |
| read.transparencycascade.org | Substack newsletter |
| capturecascade.org | Timeline database |

## Development

```bash
# Install Hugo (macOS)
brew install hugo

# Run local server
hugo server -D

# Build for production
hugo --gc --minify
```

## Deployment

Automatically deploys to GitHub Pages on push to `main` branch.

### DNS Configuration

For transparencycascade.org, add these records:

```
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   <username>.github.io
```

For read.transparencycascade.org (Substack):

```
CNAME read  target.substack-custom-domains.com
```

## Structure

```
TransparencyCascade/
├── config.toml          # Site configuration
├── content/
│   ├── _index.md        # Home page
│   └── about/
│       ├── _index.md    # About page
│       └── editorial-policies.md
├── layouts/             # Hugo templates
├── static/
│   ├── css/style.css    # Stylesheet
│   └── CNAME            # Custom domain
└── .github/workflows/   # GitHub Actions
```

## License

Content © 2026 Transparency Cascade Press, LLC. All rights reserved.
