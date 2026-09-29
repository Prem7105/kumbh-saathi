# Contributing

Kumbh Saathi connects sensitive operational workflows. Use synthetic reports and a development Supabase project when making changes.

1. Create a branch for a focused change.
2. Follow the component's README and any applicable `AGENTS.md` instructions.
3. Keep database migrations repeatable. If you change `security-hardening.sql`, update the matching block in `supabase-schema.sql`; the regression suite checks that they agree.
4. Add regression coverage for permission changes and failure handling. Check that a failed write cannot produce a success message.
5. Run the checks relevant to your change and explain the result in your pull request.

| Component | Check |
| --- | --- |
| WhatsApp / SQL / mobile API regressions | `cd kumbhsaathi-whatsapp && npm ci && npm test` |
| Command center | `cd kumbhsaathi-command-center && npm ci && npm run build` |
| Mobile bundle | `cd kumbhsaathi-mobile && npm ci && npx expo export --platform android --output-dir dist-check` |
| Booth | Install `requirements.txt`, then `python -m unittest test_security -v` inside `kumbhsaathi-ipad` |

Use separate commands instead of `&&` in Windows PowerShell 5.1. CI performs these checks without live provider credentials. Local builds do not replace staging tests with real devices and configured services.

Do not commit `.env` files, keys, raw reports from real incidents, reporter contact details, production database dumps, generated dependencies, or build directories. Include only placeholders in `.env.example`.

For a larger feature, open a proposal describing the affected workflow first. See the [roadmap](SETUP_AND_CHANGES.md#next-improvements-in-priority-order). For vulnerabilities, follow [SECURITY.md](SECURITY.md).

No project license has been selected in this repository. Do not assume third-party datasets or assets can be relicensed with the application.
