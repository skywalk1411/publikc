const git_base = "https://raw.githubusercontent.com/SheriffCarry/KirkaScripts/main/";

interface ChestItem {
  chestid: string;
  name: string;
}

interface CardItem {
  cardid: string;
  name: string;
}

async function start_chests_input(inputarray: ChestItem[]): Promise<void> {
  const customchestlist = inputarray;
  const response = await fetch(`${git_base}ConsoleScripts/Open%20All%20Chests.js`);
  const text = await response.text();
  eval(text);
}

async function start_chests(): Promise<void> {
  const response = await fetch(`${git_base}ConsoleScripts/Open%20All%20Chests.js`);
  const text = await response.text();
  eval(text);
}

async function start_cards_input(inputarray: CardItem[]): Promise<void> {
  const customcardlist = inputarray;
  const response = await fetch(`${git_base}ConsoleScripts/Open%20All%20Cards.js`);
  const text = await response.text();
  eval(text);
}

async function start_cards(): Promise<void> {
  const response = await fetch(`${git_base}ConsoleScripts/Open%20All%20Cards.js`);
  const text = await response.text();
  eval(text);
}

export function opener(): void {
  document.getElementById("opener")?.addEventListener("change", (e) => {
    const value = (document.getElementById("opener") as HTMLSelectElement)?.value;
    if (value == "Chest_Golden") {
      const customchestlist = [
        { chestid: "077a4cf2-7b76-4624-8be6-4a7316cf5906", name: "Golden" },
      ];
      start_chests_input(customchestlist);
    } else if (value == "Chest_Ice") {
      const customchestlist = [
        { chestid: "ec230bdb-4b96-42c3-8bd0-65d204a153fc", name: "Ice" },
      ];
      start_chests_input(customchestlist);
    } else if (value == "Chest_Wood") {
      const customchestlist = [
        { chestid: "71182187-109c-40c9-94f6-22dbb60d70ee", name: "Wood" },
      ];
      start_chests_input(customchestlist);
    } else if (value == "Chest_All") {
      start_chests();
    } else if (value == "Card_Cold") {
      const customcardlist = [
        { cardid: "723c4ba7-57b3-4ae4-b65e-75686fa77bf2", name: "Cold" },
      ];
      start_cards_input(customcardlist);
    } else if (value == "Card_Girlsband") {
      const customcardlist = [
        {
          cardid: "723c4ba7-57b3-4ae4-b65e-75686fa77bf1",
          name: "Girls band",
        },
      ];
      start_cards_input(customcardlist);
    } else if (value == "Card_Party") {
      const customcardlist = [
        { cardid: "6281ed5a-663a-45e1-9772-962c95aa4605", name: "Party" },
      ];
      start_cards_input(customcardlist);
    } else if (value == "Card_Soldiers") {
      const customcardlist = [
        { cardid: "9cc5bd60-806f-4818-a7d4-1ba9b32bd96c", name: "Soldiers" },
      ];
      start_cards_input(customcardlist);
    } else if (value == "Card_Periodic") {
      const customcardlist = [
        { cardid: "a5002827-97d1-4eb4-b893-af4047e0c77f", name: "Periodic" },
      ];
      start_cards_input(customcardlist);
    } else if (value == "Card_All") {
      start_cards();
    }
  });
}
