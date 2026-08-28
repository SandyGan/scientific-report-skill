/* Progressive enhancement only. Scientific content is already present in the HTML. */
(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const controls = document.querySelector("[data-console-controls]");
  const searchInput = document.querySelector("[data-report-search]");
  const domainFilter = document.querySelector('[data-filter="domain"]');
  const stateFilter = document.querySelector('[data-filter="state"]');
  const kindFilter = document.querySelector('[data-filter="kind"]');
  const clearButton = document.querySelector("[data-clear-filters]");
  const filterStatus = document.querySelector("[data-filter-status]");
  const printFilterWarning = document.querySelector("[data-print-filter-warning]");
  const printModeSelect = document.querySelector("[data-print-mode-select]");
  const records = Array.from(document.querySelectorAll("[data-record]"));
  const safetyNodes = Array.from(document.querySelectorAll('[data-safety-record="true"]'));
  const disclosures = Array.from(document.querySelectorAll("details[data-disclosure]"));

  root.classList.add("js-enabled");
  document.querySelectorAll("[data-js-only]").forEach((element) => {
    element.hidden = false;
  });

  if (controls instanceof HTMLFormElement) {
    controls.addEventListener("submit", (event) => event.preventDefault());
  }

  const normalize = (value) => String(value || "").trim().toLocaleLowerCase();

  const tokensFor = (value) => normalize(value)
    .split(/[\s,|]+/u)
    .filter(Boolean);

  const matchesDimension = (record, dimension, selectedValue) => {
    const selected = normalize(selectedValue);
    if (!selected || selected === "all") {
      return true;
    }
    const tokens = tokensFor(record.dataset[dimension]);
    return tokens.includes(selected);
  };

  const isEffectivelyHidden = (element) => {
    let current = element;
    while (current instanceof HTMLElement) {
      if (current.hidden) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  };

  const filterEmptyNotes = Array.from(document.querySelectorAll(".report-section, .annex-section"))
    .map((section) => {
      if (!section.querySelector("[data-record]")) {
        return null;
      }
      const note = document.createElement("p");
      note.className = "filter-empty-note";
      note.hidden = true;
      note.setAttribute("role", "status");
      note.textContent = "No records in this section match the current working-view filters. Section coverage remains visible; full archive print restores all records.";
      const heading = section.querySelector(".coverage-banner, .section-heading");
      if (heading) {
        heading.insertAdjacentElement("afterend", note);
      } else {
        section.prepend(note);
      }
      return { section, note };
    })
    .filter(Boolean);

  const selectedValue = (element) => element instanceof HTMLSelectElement ? element.value : "all";

  const applyFilters = () => {
    const searchTerm = normalize(searchInput instanceof HTMLInputElement ? searchInput.value : "");
    const domain = selectedValue(domainFilter);
    const state = selectedValue(stateFilter);
    const kind = selectedValue(kindFilter);
    const active = Boolean(searchTerm || domain !== "all" || state !== "all" || kind !== "all");
    const selfMatches = new Map();

    records.forEach((record) => {
      const searchableText = normalize(record.textContent);
      const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
      const matches = matchesSearch
        && matchesDimension(record, "domain", domain)
        && matchesDimension(record, "state", state)
        && matchesDimension(record, "kind", kind);
      selfMatches.set(record, matches);
    });

    records.forEach((record) => {
      const matchingDescendant = Array.from(record.querySelectorAll("[data-record]"))
        .some((descendant) => selfMatches.get(descendant) === true);
      record.hidden = !(selfMatches.get(record) || matchingDescendant);
    });

    filterEmptyNotes.forEach(({ section, note }) => {
      const sectionRecords = Array.from(section.querySelectorAll("[data-record]"));
      const hasVisibleRecord = sectionRecords.some((record) => !record.hidden);
      note.hidden = !active || hasVisibleRecord;
    });

    const visibleCount = records.filter((record) => !isEffectivelyHidden(record)).length;
    const hiddenSafetyCount = safetyNodes.filter(isEffectivelyHidden).length;

    body.dataset.filterActive = active ? "true" : "false";
    body.dataset.visibleRecords = String(visibleCount);
    body.dataset.totalRecords = String(records.length);
    body.dataset.hiddenSafetyRecords = String(hiddenSafetyCount);

    const safetyMessage = hiddenSafetyCount > 0
      ? `${hiddenSafetyCount} safety-relevant records or disclosures are outside this view.`
      : "No safety-relevant records or disclosures are hidden by the current filters.";
    if (printFilterWarning) {
      printFilterWarning.textContent = `Safety check: ${safetyMessage}`;
    }

    if (filterStatus) {
      if (!active) {
        filterStatus.textContent = `Showing all ${records.length} report records. Failures, conflicts, exclusions, missing states, and access gaps remain in view.`;
      } else if (hiddenSafetyCount > 0) {
        filterStatus.textContent = `Working view: ${visibleCount} of ${records.length} records shown. ${safetyMessage} Choose Full archive before printing to restore every record.`;
      } else {
        filterStatus.textContent = `Working view: ${visibleCount} of ${records.length} records shown. ${safetyMessage}`;
      }
    }
  };

  [searchInput, domainFilter, stateFilter, kindFilter].forEach((control) => {
    if (!control) {
      return;
    }
    const eventName = control instanceof HTMLInputElement ? "input" : "change";
    control.addEventListener(eventName, applyFilters);
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      if (searchInput instanceof HTMLInputElement) {
        searchInput.value = "";
      }
      [domainFilter, stateFilter, kindFilter].forEach((filter) => {
        if (filter instanceof HTMLSelectElement) {
          filter.value = "all";
        }
      });
      applyFilters();
      if (searchInput instanceof HTMLInputElement) {
        searchInput.focus();
      }
    });
  }

  document.querySelectorAll("[data-expand-all]").forEach((button) => {
    button.addEventListener("click", () => {
      disclosures.forEach((details) => {
        details.open = true;
      });
    });
  });

  document.querySelectorAll("[data-collapse-all]").forEach((button) => {
    button.addEventListener("click", () => {
      disclosures.forEach((details) => {
        details.open = false;
      });
    });
  });

  const setPrintMode = (mode) => {
    const allowedModes = new Set(["summary", "full", "filtered"]);
    body.dataset.printMode = allowedModes.has(mode) ? mode : "full";
  };

  if (printModeSelect instanceof HTMLSelectElement) {
    setPrintMode(printModeSelect.value);
    printModeSelect.addEventListener("change", () => setPrintMode(printModeSelect.value));
  } else {
    setPrintMode("full");
  }

  document.querySelectorAll("[data-print-report]").forEach((button) => {
    button.addEventListener("click", () => {
      window.print();
    });
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditable = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || target instanceof HTMLButtonElement
      || (target instanceof HTMLElement && target.isContentEditable);

    if (event.key === "/" && !isEditable && searchInput instanceof HTMLInputElement) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (event.key === "Escape" && searchInput instanceof HTMLInputElement && searchInput.value) {
      searchInput.value = "";
      applyFilters();
      searchInput.focus();
    }
  });

  applyFilters();
})();
