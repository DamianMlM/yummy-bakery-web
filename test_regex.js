
const lines = [
    "2x Roles Canela",
    "1x Café",
    "3 x Brownies", // Space around x
    "1 Rol de Canela", // No x
    "2x Roles (con nuez)", // Bracket
    "  4x  Conchas  ", // Whitespace
    "5x" // Malformed
];

console.log("Testing Regex: /^\\s*(\\d+)x\\s+([^\\(]+)/");

lines.forEach(line => {
    const match = line.match(/^\s*(\d+)x\s+([^\(]+)/);
    if (match) {
        console.log(`[PASS] "${line}" -> Qty: ${match[1]}, Name: "${match[2].trim()}"`);
    } else {
        console.log(`[FAIL] "${line}"`);
    }
});
