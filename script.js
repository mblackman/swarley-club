document.addEventListener('DOMContentLoaded', () => {
    const joinButton = document.getElementById('joinButton');
    const dogPics = document.querySelectorAll('.dog-pic');
    const memberCountSpan = document.getElementById('memberCount');
    const swarleyFactP = document.getElementById('swarleyFact');
    const barkSound = document.getElementById('barkSound');
    const clubTitle = document.querySelector('h1');

    const localStorageKey = 'swarleyClubJoined'; // Key for localStorage flag
    const counterApiUrl = '/counter'; // URL for the Cloudflare Worker

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

    // --- Counter Logic ---

    // Function to fetch the CURRENT count (using GET) - Does NOT increment
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
            memberCountSpan.textContent = data.count ?? 'Error!';
        } catch (error) {
            console.error("Failed to increment or update counter:", error);
            memberCountSpan.textContent = 'Error!';
        }
    }

    // --- Initial Load Actions ---
    displayRandomFact();
    fetchInitialCount();
    loadSwarleyPics();

    // --- Button Click Handler ---
    if (joinButton) {
        joinButton.addEventListener('click', async () => {
            console.log("Join button clicked!");
            joinButton.disabled = true; // Disable button immediately

            // --- Actions to perform on EVERY click ---
            try { confetti({ /* ... confetti options ... */ }); } catch (e) { console.error("Confetti error:", e); }
            dogPics.forEach((pic, index) => {
                if (index % 2 === 0) {
                    pic.classList.add('dancing-1');
                } else {
                    pic.classList.add('dancing-2');
                }
            });
            if (barkSound) { try { barkSound.currentTime = 0; await barkSound.play(); } catch (e) { console.error("Audio play failed:", e); } }

            // --- Conditional Counter Increment ---
            if (!localStorage.getItem(localStorageKey)) {
                // First click in this browser
                console.log("First join from this browser. Incrementing counter...");
                await incrementAndFetchCounter();
                localStorage.setItem(localStorageKey, 'true');
            } else {
                // Repeat click
                console.log("Already joined from this browser. Animations played, counter not incremented.");
                // Re-enable button slightly quicker maybe, since no network request? Optional.
            }

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