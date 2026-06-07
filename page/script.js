document.addEventListener('DOMContentLoaded', () => {
    const joinButton = document.getElementById('joinButton');
    const dogPics = document.querySelectorAll('.dog-pic');
    const memberCountSpan = document.getElementById('memberCount');
    const swarleyFactP = document.getElementById('swarleyFact');
    const barkSound = document.getElementById('barkSound');
    const clubTitle = document.querySelector('h1');

    // API base resolves to prod ("/api") or the dev Worker — see config.js
    const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || '/api';
    const counterApiUrl = `${apiBase}/counter`;

    // Respect users who prefer reduced motion (important on a memorial page).
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Things we'll always remember about Swarley ---
    const facts = [
        "Accepted pats with tiny, appreciative whimpers.",
        "A distinguished gentleman who wore the senior-dog vibe proudly.",
        "Found pure joy frolicking in freshly fallen snow.",
        "Considered snow and grass to be seasonal delicacies.",
        "Once cleared a coffee table in a single leap, just because.",
        "Achieved supersonic flight speeds (only in his dreams).",
        "Believed water belonged strictly inside the bowl. No exceptions.",
        "Will be fondly remembered for his 'Era of Maximum Fluffiness'.",
        "Caused spontaneous hugging, thanks to extreme natural fluffiness.",
        "Carried a signature scent known only as 'Eau de Swarley'.",
        "A professional cuddler and expert human bed-warmer.",
        "Regarded overly-fluffy white dogs with deep suspicion.",
        "A highly efficient 'love sponge', absorbing all available affection.",
        "An aspiring interior designer, famous for spontaneous bed rearrangement."
    ];

    // Photo pool for the homepage rotation. Filled at load time from:
    //   • window.SWARLEY_GALLERY — optional pipeline-generated photos
    //     (scripts/optimize-gallery.mjs), with webp/jpg siblings; and
    //   • approved submissions from the API (owner uploads + community shares,
    //     R2-served, no format variants — see fetchCommunityPics below).
    const allSwarleyPics = [];

    // Pull in pipeline-generated photos (scripts/optimize-gallery.mjs writes
    // window.SWARLEY_GALLERY). Each has webp/jpg siblings, so the non-remote
    // render path handles them like the static curated pics above.
    if (Array.isArray(window.SWARLEY_GALLERY)) {
        window.SWARLEY_GALLERY.forEach((g) => {
            if (g && g.base) allSwarleyPics.push({ src: `${g.base}.${g.ext || 'jpg'}`, alt: g.alt || 'Swarley' });
        });
    }

    function displayRandomFact() {
        if (swarleyFactP) {
            const randomIndex = Math.floor(Math.random() * facts.length);
            swarleyFactP.textContent = facts[randomIndex];
            swarleyFactP.classList.add('fact-loaded');
        }
    }

    // Pull approved community uploads from the submissions API (R2-backed) and
    // fold them into the rotation pool. Best-effort: if it fails, we just keep
    // the curated pics. Remote items carry `remote: true` so the renderer knows
    // they have no webp/jpg sibling variants.
    async function fetchCommunityPics() {
        try {
            const res = await fetch(`${apiBase}/submissions`, { method: 'GET' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const items = await res.json();
            if (!Array.isArray(items)) return;
            const origin = apiBase.replace(/\/api$/, '');
            items.forEach((sub) => {
                if (!sub || !sub.imageUrl) return;
                const src = sub.imageUrl.startsWith('http') ? sub.imageUrl : `${origin}${sub.imageUrl}`;
                const altParts = [];
                if (sub.caption) altParts.push(sub.caption);
                if (sub.submitter) altParts.push(`shared by ${sub.submitter}`);
                const alt = altParts.length ? `Swarley — ${altParts.join(', ')}` : 'Swarley, shared by a friend';
                allSwarleyPics.push({ src, alt, remote: true });
            });
        } catch (err) {
            console.error('Failed to load community pics for rotation:', err);
        }
    }

    function loadSwarleyPics() {
        const dogPicElements = document.querySelectorAll('.dog-pic img');
        const numPicsToDisplay = dogPicElements.length;

        if (dogPicElements.length > 0 && allSwarleyPics.length > 0) {
           const selectedPics = getRandomPics(allSwarleyPics, numPicsToDisplay);

           dogPicElements.forEach((imgElement, index) => {
             const pic = selectedPics[index];
             if (pic) {
               const pictureElement = imgElement.closest('.dog-pic');
               const sources = pictureElement ? pictureElement.querySelectorAll('source') : [];

               if (pic.remote) {
                  // R2-served upload: one URL, no format variants. Point every
                  // <source> and the fallback <img> at the same URL.
                  sources.forEach(source => { source.srcset = pic.src; });
                  imgElement.src = pic.src;
               } else {
                  // Curated static pic: swap in the webp/jpg siblings by base name.
                  const baseSrc = pic.src.substring(0, pic.src.lastIndexOf('.'));
                  sources.forEach(source => {
                      if (source.type === 'image/webp') {
                          source.srcset = baseSrc + '.webp';
                      } else if (source.type === 'image/jpeg') {
                          source.srcset = baseSrc + '.jpg';
                      }
                  });
                  imgElement.src = pic.src.replace(/\.\w+$/, '.jpg');
               }
               imgElement.alt = pic.alt;
               imgElement.style.opacity = 0;
               imgElement.onload = () => { imgElement.style.opacity = 1; };
             }
           });
        }
    }

    function getRandomPics(pool, count) {
        if (count > pool.length) {
          console.warn("Requested more pictures than available!");
          count = pool.length;
        }
        // Fisher-Yates (Knuth) shuffle algorithm (or simpler method for small counts)
        const shuffled = pool.slice(); // Create a copy
        let m = shuffled.length, t, i;
        // While there remain elements to shuffle…
        while (m) {
          // Pick a remaining element…
          i = Math.floor(Math.random() * m--);
          // And swap it with the current element.
          t = shuffled[m];
          shuffled[m] = shuffled[i];
          shuffled[i] = t;
        }
        return shuffled.slice(0, count); // Return the first 'count' elements
    }

    async function fetchInitialCount() {
        if (!memberCountSpan) return; // Exit if span not found
        try {
            const response = await fetch(counterApiUrl, { method: 'GET' });
            if (!response.ok) {
                 throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log("Initial count fetched:", data);
            memberCountSpan.textContent = data.count ?? 'Error';
        } catch (error) {
            console.error("Failed to fetch initial counter:", error);
            memberCountSpan.textContent = 'N/A';
        }
    }

    // Function to increment count via Worker (using POST) and update display
    async function incrementAndFetchCounter() {
        if (!memberCountSpan) return;
        try {
            const response = await fetch(counterApiUrl, { method: 'POST' });
            if (!response.ok) {
                 let errorMsg = `HTTP error! status: ${response.status}`;
                try { const errorData = await response.json(); errorMsg += `, Message: ${errorData.error || 'Unknown error'}`; } catch (e) {/*Ignore*/}
                throw new Error(errorMsg);
            }
            const data = await response.json();
            if (data.count != null) {
                memberCountSpan.textContent = data.count;
            }
        } catch (error) {
            console.error("Failed to increment or update counter:", error);
        }
    }

    // --- Initial Load Actions ---
    displayRandomFact();
    fetchInitialCount();
    loadSwarleyPics(); // any pipeline statics immediately…
    fetchCommunityPics().then(loadSwarleyPics); // …then re-roll once API photos arrive

    // --- Button Click Handler ---
    if (joinButton) {
        joinButton.addEventListener('click', async () => {
            console.log("Join button clicked!");
            joinButton.disabled = true; // Disable button immediately

            // --- Gentle, warm "candle glow" celebration (skipped if reduced motion) ---
            if (!prefersReducedMotion) {
                try {
                    confetti({
                        particleCount: 60,
                        spread: 55,
                        startVelocity: 28,
                        gravity: 0.8,
                        scalar: 0.9,
                        ticks: 160,
                        origin: { y: 0.6 },
                        colors: ['#ffb347', '#ffcc66', '#ffe0a3', '#fff5e0'],
                    });
                } catch (e) { console.error("Confetti error:", e); }
                dogPics.forEach((pic, index) => {
                    pic.classList.add(index % 2 === 0 ? 'dancing-1' : 'dancing-2');
                });
            }
            // A little remembrance of his bark (no-op if the sound file is absent).
            if (barkSound) { try { barkSound.currentTime = 0; await barkSound.play(); } catch (e) { /* fine — sound is optional */ } }

            await incrementAndFetchCounter();

            // --- Actions after conditional logic ---
            setTimeout(() => {
                dogPics.forEach(pic => {
                    pic.classList.remove('dancing-1');
                    pic.classList.remove('dancing-2');
                });
                joinButton.disabled = false;
                console.log("Stopping the dance.");
            }, 4000);

        });
    } else {
        console.error("Join button not found!");
    }

    // --- Header Animation Trigger ---
    setTimeout(() => {
        if (clubTitle) { clubTitle.classList.add('loaded'); }
        else { console.error("Club title H1 not found for animation!"); }
    }, 100);

}); // End of DOMContentLoaded