# The Prompt

Copy everything in the block below into **Claude Code** (claude.com/claude-code)
opened in this template folder. Fill in the four bracketed lines first. That's it.

---

```
You are helping me build an animated GitHub profile README using the scripts in
this folder. Do NOT rewrite the scripts from scratch -- use them as-is and only
edit the marked config sections.

My details:
- GitHub username: 2403051050553
- Name + tagline: JATIN TEHALRAM AHUJA — Computer Science Engineering Student · AI · Full Stack · DSA
- Wordmark text: JATIN
- A photo of me to turn into ASCII art: [ADD YOUR OWN PHOTO FILE HERE IF YOU WANT A PERSONAL ASCII PORTRAIT]
- Links (portfolio | linkedin | X | instagram): [GitHub only: https://github.com/2403051050553]

Here is exactly what I want you to do, in order:

1. Check my tools. I need Python 3 with: pillow, numpy, opencv-python, rembg,
   onnxruntime (for the local one-time image prep) and requests + beautifulsoup4
   (for the contribution scraper). Install anything missing from
   requirements-local.txt and scripts/requirements.txt.

2. Create a public repo named EXACTLY my username (so GitHub renders it on my
   profile). Use the gh CLI if I'm logged in; otherwise walk me through it.

3. Portrait: run `python scripts/prep_photo.py <my photo> source-prepped.png`
   (removes the background with rembg + boosts local contrast with CLAHE so my
   face is legible, not a dark blob), then `python scripts/make_ascii_svg.py` to
   produce avi-ascii.svg -- a clean MONOCHROME ascii portrait that "types" itself
   in like a terminal. Tune CONTRAST / GAMMA / WHITE_FLOOR in the script
   until the face reads well. Note: the SVG starts blank at t=0 and reveals on
   load -- to preview the final frame, set STATIC=1 when generating.

4. 3D ASCII Wordmark: edit TEXT in scripts/make_wordmark_svg.py with my name,
   then run `python scripts/make_wordmark_svg.py --mode rock --out wordmark.svg`.
   Ensure ROW_MARGIN keeps it at the exact same visual height (~385px) as the portrait.

5. Contribution graph: run `python scripts/generate_streak_svg.py 2403051050553 contrib-heatmap.svg`
   to produce an animated pop-and-flash GitHub contribution graph.

6. README: copy profile-README-template.md to README.md and fill in my name,
   tagline, and links. The portrait (width 370) and 3D wordmark (width 490) sit in
   a table so they're the same height.

7. Automation: copy .github/workflows/update-profile-art.yml in. It refreshes
   the graph every day with zero auth. After the first push, set the repo's
   Settings -> Actions -> Workflow permissions to "Read and write", then
   trigger the workflow once so the graph exists immediately.

8. Commit and push everything. Show me the final rendered profile and the repo
   URL.

Be visual: render previews as you go and iterate with me before pushing. Keep it
clean and monochrome -- no rainbow colors, no glitch effects.
```

---

That's the whole thing. The scripts do the heavy lifting; the prompt just drives
them and customizes the content to you.
