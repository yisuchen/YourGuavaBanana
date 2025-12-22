Create a git commit with detailed log using zh-tw.
**When adding new lines to commit message, use single quote to multi-line text.**.
If there is a single quote in the message, use standard bash syntax to escape that
single quote.
Example:
```
git commit -m 'feat: new feature
- description of the feature 1
- description of the feature 2'\''s sub-feature
'
