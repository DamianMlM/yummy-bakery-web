
const fetch = globalThis.fetch;

async function test() {
    const url = "https://script.google.com/macros/s/AKfycbwSJEgRmBuEo4JI_kN9-vpuokSCoHC85rAd4MA2RUhmbRwWHqyJeyU8lDX-Up2g6w3Q/exec";

    console.log("--- TESTING POST admin_data ---");
    try {
        const res = await fetch(url, {
            method: 'POST',
            redirect: "follow", // Important for Apps Script
            body: JSON.stringify({ accion: 'admin_data' }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } // 'text/plain' avoids CORS preflight issues often in GAS
        });

        const text = await res.text();
        console.log("Status:", res.status);

        try {
            const data = JSON.parse(text);
            console.log("Is Object?", typeof data);
            const keys = Object.keys(data);
            console.log("Keys:", keys);

            if (data.pedidos) {
                console.log("SUCCESS: 'pedidos' found in response.");
                console.log("Pedidos count:", data.pedidos.length);
            } else {
                console.log("FAILURE: 'pedidos' NOT found in response.");
                console.log("Full response preview:", text.substring(0, 200));
            }
        } catch (e) {
            console.log("JSON Parse Error:", e.message);
            console.log("Response text start:", text.substring(0, 200));
        }
    } catch (e) {
        console.log("Network Error:", e.message);
    }
    console.log("--- END TEST ---");
}

test();
