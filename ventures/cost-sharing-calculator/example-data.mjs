// The page's examples. The claims example is real (Mishnah, Ketubot 10:4;
// data/SOURCE.md); the road and water examples are made-up numbers.
export const EXAMPLES = {
  claims: {
    label: "Mishnah, Ketubot 10:4: three wives' claims on an estate of 200 zuz (real)",
    mode: "claims",
    estate: 200,
    unit: "",
    csv: "wife,claim_zuz\nFirst wife,100\nSecond wife,200\nThird wife,300\n",
  },
  road: {
    label: "Five households on a private road, $18,000 resurfacing (made-up numbers)",
    mode: "road",
    total: 18000,
    unit: "$",
    csv: "household,metres_from_public_road\nAda,200\nBen,450\nCal,450\nDee,900\nEve,1200\n",
  },
  coalitions: {
    label: "Three towns pricing a shared water plant, $ millions (made-up numbers)",
    mode: "coalitions",
    game: "cost",
    unit: "$",
    csv: "group,cost\nNorth,6.5\nMill,4.2\nEast,3.9\nNorth+Mill,8.9\nNorth+East,9.6\nMill+East,6.1\nNorth+Mill+East,11.4\n",
  },
};
