document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selection ---
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
        "Swarley secretly believes the vacuum cleaner is a noisy sheep.",
        "Swarley has hidden exactly 17 squeaky toys. Location classified.",
        "Swarley's favorite shape is 'treat'.",
        "Swarley invented the 'zoomies' as a form of interpretive dance.",
        "Swarley dreams in smells, mostly of cheese and adventure.",
        "If Swarley had thumbs, he'd use them for opening treat bags.",
        "Swarley considers car rides a spectator sport.",
        "Swarley is fluent in three languages: Tail Wag, Head Tilt, and Sigh.",
        "Swarley’s official position is Chief Morale Officer.",
        "Swarley maintains that squirrels are just fuzzy park terrorists."
    ];

    function displayRandomFact() {
        if (swarleyFactP) {
            const randomIndex = Math.floor(Math.random() * facts.length);
            swarleyFactP.textContent = facts[randomIndex];
            swarleyFactP.classList.add('fact-loaded');
        }
    }

    // --- Counter Logic ---

    // Function to fetch the CURRENT count (using GET) - Does NOT increment
    async function fetchInitialCount() {
        if (!memberCountSpan) return; // Exit if span not found
        try {
            const response = await fetch(counterApiUrl, { method: 'GET' }); // Explicitly GET
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
        if (!memberCountSpan) return; // Exit if span not found
        try {
            const response = await fetch(counterApiUrl, { method: 'POST' }); // Use POST to signal increment
            if (!response.ok) {
                 let errorMsg = `HTTP error! status: ${response.status}`;
                try { const errorData = await response.json(); errorMsg += `, Message: ${errorData.error || 'Unknown KV Error'}`; } catch (e) {/*Ignore*/}
                throw new Error(errorMsg);
            }
            const data = await response.json();
            memberCountSpan.textContent = data.count ?? 'Error!';
        } catch (error) {
            console.error("Failed to increment or update counter:", error);
            // Optionally revert text or show previous known good value if needed
            memberCountSpan.textContent = 'Error!';
        }
    }

    // --- Initial Load Actions ---
    displayRandomFact(); // Display initial fact
    fetchInitialCount(); // Fetch and display the current count on page load

    // --- Button Click Handler ---
    if (joinButton) {
        joinButton.addEventListener('click', async () => {
            console.log("Join button clicked!");
            joinButton.disabled = true; // Disable button immediately

            // --- Actions to perform on EVERY click ---
            try { confetti({ /* ... confetti options ... */ }); } catch (e) { console.error("Confetti error:", e); }
            dogPics.forEach(pic => pic.classList.add('dancing'));
            if (barkSound) { try { barkSound.currentTime = 0; await barkSound.play(); } catch (e) { console.error("Audio play failed:", e); } }

            // --- Conditional Counter Increment ---
            if (!localStorage.getItem(localStorageKey)) {
                // First click in this browser
                console.log("First join from this browser. Incrementing counter...");
                await incrementAndFetchCounter(); // Call the INCREMENT function
                localStorage.setItem(localStorageKey, 'true');
            } else {
                // Repeat click
                console.log("Already joined from this browser. Animations played, counter not incremented.");
                // Re-enable button slightly quicker maybe, since no network request? Optional.
            }

            // --- Actions after conditional logic ---
            setTimeout(() => {
                dogPics.forEach(pic => pic.classList.remove('dancing'));
                joinButton.disabled = false;
                console.log("Stopping the dance.");
            }, 4000); // 4 seconds delay

        }); // End of event listener
    } else {
        console.error("Join button not found!");
    }

    // --- Header Animation Trigger ---
    setTimeout(() => {
        if (clubTitle) { clubTitle.classList.add('loaded'); }
        else { console.error("Club title H1 not found for animation!"); }
    }, 100);

}); // End of DOMContentLoaded