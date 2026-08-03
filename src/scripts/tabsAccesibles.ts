export {};

declare global {
  interface Window {
    __tabsAccesibles?: boolean;
  }
}

function sincronizarTabindex(): void {
  document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach((tablist) => {
    tablist.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => {
      tab.setAttribute("tabindex", tab.classList.contains("active") ? "0" : "-1");
    });
  });
}

if (!window.__tabsAccesibles) {
  window.__tabsAccesibles = true;

  document.addEventListener("astro:page-load", sincronizarTabindex);

  document.addEventListener("keydown", (event) => {
    const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>('[role="tab"]');
    if (!tab) return;
    const tablist = tab.closest<HTMLElement>('[role="tablist"]');
    if (!tablist) return;
    const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));
    const index = tabs.indexOf(tab);
    let nuevo = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nuevo = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nuevo = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nuevo = 0;
    else if (event.key === "End") nuevo = tabs.length - 1;
    else return;
    event.preventDefault();
    const destino = tabs[nuevo];
    destino.focus();
    destino.click();
  });

  document.addEventListener("click", (event) => {
    const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>('[role="tab"]');
    if (!tab) return;
    const tablist = tab.closest<HTMLElement>('[role="tablist"]');
    if (!tablist) return;
    tablist.querySelectorAll<HTMLElement>('[role="tab"]').forEach((t) => {
      t.setAttribute("tabindex", t === tab ? "0" : "-1");
    });
  });
}
