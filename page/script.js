document.addEventListener('DOMContentLoaded', () => {
    const joinButton = document.getElementById('joinButton');
    const dogPics = document.querySelectorAll('.dog-pic');
    const memberCountSpan = document.getElementById('memberCount');
    const swarleyFactP = document.getElementById('swarleyFact');
    const barkSound = document.getElementById('barkSound');
    const clubTitle = document.querySelector('h1');
    const favoritesList = document.getElementById('favoritesList');

    // API base resolves to prod ("/api") or the dev Worker — see config.js
    const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || '/api';
    const counterApiUrl = `${apiBase}/counter`;

    // Respect users who prefer reduced motion (important on a memorial page).
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Swarley Facts ---
    const facts = [
        "Accepts pats with tiny, appreciative whimpers.",
        "A distinguished gentleman rocking the senior dog vibe.",
        "Finds pure joy frolicking in freshly fallen snow.",
        "Considers snow and grass to be seasonal delicacies.",
        "Once cleared a coffee table in a single leap, just because.",
        "Achieves supersonic flight speeds (only in his dreams).",
        "Believes water belongs strictly inside the bowl. No exceptions.",
        "Fondly remembers his 'Era of Maximum Fluffiness'.",
        "Warning: May cause spontaneous hugging due to extreme natural fluffiness.",
        "Possesses a signature scent known only as 'Eau de Swarley'.",
        " A professional cuddler and human bed-warming expert.",
        "Views overly-fluffy white dogs with deep suspicion.",
        "Functions as a highly efficient 'love sponge', absorbing all available affection.",
        "An aspiring interior designer, known for spontaneous bed rearrangement."
    ];

    const allSwarleyPics = [
        // IMPORTANT: User needs to replace these with REAL paths/URLs and descriptive alt text
        { src: "images/swarley-1.webp", alt: "Swarley being a gentleman in a suit" },
        { src: "images/swarley-2.webp", alt: "Swarley's side profile and smile" },
        { src: "images/swarley-3.webp", alt: "Swarley looking ghastly and cute" },
        { src: "images/swarley-4.webp", alt: "Swarley prancing through the grass" },
        { src: "images/swarley-5.webp", alt: "Swarley is a nugget" },
        { src: "images/swarley-6.webp", alt: "Swarley as a little pup in the car" },
        { src: "images/swarley-7.webp", alt: "Swarley looking like a disheveled old man" },
        { src: "images/swarley-8.webp", alt: "Swarley's little feet" },
        { src: "images/swarley-9.webp", alt: "Swarley looking like a rabid beast" },
        { src: "images/swarley-10.webp", alt: "Swarley wondering if you got snacks" },
        { src: "images/swarley-11.webp", alt: "Swarley looking dapper in a bandana" },
        { src: "images/swarley-12.webp", alt: "Swarley trying his hardest to smile" },
        { src: "images/swarley-13.webp", alt: "Swarley relaxing" },
      ];

    function displayRandomFact() {
        if (swarleyFactP) {
            const randomIndex = Math.floor(Math.random() * facts.length);
            swarleyFactP.textContent = facts[randomIndex];
            swarleyFactP.classList.add('fact-loaded');
        }
    }

    // Populate the "A Few of His Favorite Things" list from the facts above.
    function renderFavorites() {
        if (!favoritesList) return;
        favoritesList.innerHTML = '';
        facts.forEach((fact) => {
            const li = document.createElement('li');
            li.textContent = fact.trim();
            favoritesList.appendChild(li);
        });
    }

    function loadSwarleyPics() {
        const dogPicElements = document.querySelectorAll('.dog-pic img');
        const numPicsToDisplay = dogPicElements.length;
      
        if (dogPicElements.length > 0 && allSwarleyPics.length > 0) {
           const selectedPics = getRandomPics(allSwarleyPics, numPicsToDisplay);
      
           dogPicElements.forEach((imgElement, index) => {
             if (selectedPics[index]) {
               // --- If using <picture> element ---
               const pictureElement = imgElement.closest('.dog-pic');
               if (pictureElement) {
                  // Find all <source> elements within the picture
                  const sources = pictureElement.querySelectorAll('source');
                  // Get the base filename (without extension)
                  const baseSrc = selectedPics[index].src.substring(0, selectedPics[index].src.lastIndexOf('.'));
      
                  // Update srcset for each source type (webp, avif, jpg etc.)
                  sources.forEach(source => {
                      if (source.type === 'image/webp') {
                          source.srcset = baseSrc + '.webp';
                      } else if (source.type === 'image/jpeg') {
                          source.srcset = baseSrc + '.jpg';
                      }
                  });
               }
               // --- Always update the fallback <img> ---
               imgElement.src = selectedPics[index].src.replace(/\.\w+$/, '.jpg');
               imgElement.alt = selectedPics[index].alt;
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
                try { const errorData = await response.json(); errorMsg += `, Message: ${errorData.error || 'Unknown KV Error'}`; } catch (e) {/*Ignore*/}
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
    renderFavorites();
    fetchInitialCount();
    loadSwarleyPics();

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