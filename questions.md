## What approach did you take to scraping and structuring the knowledge base data?

MoFloKnowledge announces itself as MoFloKnowledgeBot/1.0, obeys robots.txt and Crawl-delay, refuses private network addresses, and caps itself at 15 pages to depth 2 (25 to depth 3) and five minutes. It reads the informative pages first — about, team, services, pricing — and leaves contact and booking for later. Blogs, careers and legal pages come last.

Extraction uses fixed rules, not AI guesswork: structured data first, then visible text. Every value must cite exact page evidence and pass validation, or it stays empty. Results go into typed entries — company basics, positioning, market, branding, online presence, site links, key people, offerings — each tagged with its source. Every edit is a new revision, published snapshots are immutable and hashed, and a person approves each crawl.

## What information beyond our current baseline did you choose to include, and why?

What i included:

- Revenue (Company Foundation): usually next to employee count on an About page. Worth capturing when stated.
- Phone (Online Presence): the most common contact point on small-business sites, and a real call to action.
- Site Links: a map of the internal pages behind the profile. You can add pages to steer the next crawl.
- Age, nationality, portrait (Key People): all optional. Filled only when stated or uploaded, never guessed.
- Description, URL, images (Offerings): a name and feature list don't say what the thing is. The URL ties it to a real page.
- Provenance: every value carries its sources, quoted evidence, origin and status. Anyone can check a claim.

## How would your knowledge base design improve the outputs of MoSocial, MoMail, and MoBlogs specifically?

What all three gain

- Facts with evidence. Every value cites its page; unknowns stay empty. So generated content doesn't invent prices, years, credentials or people — and each tool can verify a claim before using it.
- Content is built only from approved values in a published, hashed snapshot. If a post or email goes wrong, you can trace the exact facts version it used.

MoSocial

Brand voice, colours, fonts, logos and art style keep posts on-brand. Verified social links show where to post and which handles to tag. Each offering gives a post idea with a real URL. Calls to action come from the site's actual buttons ("Book a consultation"), not invented ones.

MoMail

Personas and customer needs drive segmentation and different emails per segment. Funnels and CTAs match each email to a real next step. Pricing appears only when the site states it. Key people with titles give a believable sender and signature; gender is set only from evidence.

MoBlogs

Offerings and industry groupings give topic clusters grounded in what the company sells. The founding story, pitch and people's backgrounds supply "about us" and expertise angles. Service locations support local articles. Site links give real pages to link to.

## What would you improve or change about MoKnowledge if you had more time?

There are a ton of things i would improve. The styling is pretty rough, the web crawling could use more work. The AI prompt doesn't produce a satifcatory result. The biggest thing I didn't get to was finishing the Supabase implementation. Never got around to it, just needed a few small changes and some API keys.

## What was the most challenging part of this assignment?

The deadline was definitely the most challenging part. There was so much to do in so little time. The second most challenging thing is building an effective web scraper but tht would've been easier to figure out with more time. Just so many things that I wanted to get to that I didn't have enough time. Doesn't help that I was pretty busy personally while I was working on this.
