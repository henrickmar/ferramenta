const STORAGE_KEY = "controle-ferramentas:dados";

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 900000;

const COLORS = {
  rust: "#C1440E"
};

let tools = [];
let loans = [];

let currentFilter = "todas";
let search = "";

let selectedPhotos = [];
let loanTool = null;
let previewTool = null;

/* =========================
   UTILITÁRIOS
========================= */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(iso) {
  if (!iso) return "";

  const d = new Date(iso + "T00:00:00");

  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function diasEmprestada(iso) {
  const ms =
    Date.now() -
    new Date(iso + "T00:00:00").getTime();

  return Math.max(
    0,
    Math.floor(ms / 86400000)
  );
}

function formatMoney(value) {
  const n = Number(value);

  if (!n && n !== 0) return "";

  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function showError(message) {
  const banner = document.getElementById("errorBanner");

  banner.textContent = message;
  banner.classList.remove("hidden");
}

function clearError() {
  document
    .getElementById("errorBanner")
    .classList.add("hidden");
}

function showSaving() {
  document
    .getElementById("savingBanner")
    .classList.remove("hidden");
}

function hideSaving() {
  document
    .getElementById("savingBanner")
    .classList.add("hidden");
}

/* =========================
   LOCAL STORAGE
========================= */

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      tools = [];
      loans = [];
      return;
    }

    const data = JSON.parse(saved);

    tools = data.tools || [];
    loans = data.loans || [];

  } catch (error) {
    console.error("Erro ao carregar dados:", error);

    tools = [];
    loans = [];

    showError("Nao foi possivel carregar os dados.");
  }
}

function saveData() {
  showSaving();

  try {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tools,
        loans
      })
    );

  } catch (error) {

    console.error("Erro ao salvar:", error);

    showError(
      "Nao foi possivel salvar. Talvez o armazenamento do navegador esteja cheio."
    );

  } finally {

    setTimeout(hideSaving, 300);
  }
}

/* =========================
   FOTOS
========================= */

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);

    reader.onerror = () =>
      reject(new Error("Falha ao ler imagem"));

    reader.readAsDataURL(file);
  });
}

function renderPhotoSelector() {

  const photoRow = document.getElementById("photoRow");

  photoRow.innerHTML = "";

  selectedPhotos.forEach((src, index) => {

    const wrapper = document.createElement("div");

    wrapper.className = "photo-thumb-wrap";

    wrapper.innerHTML = `
      <img
        src="${src}"
        class="photo-thumb"
        alt="Foto ${index + 1}"
      >

      <button
        type="button"
        class="photo-remove-btn"
        data-index="${index}"
        aria-label="Remover foto"
      >
        x
      </button>
    `;

    photoRow.appendChild(wrapper);
  });

  if (selectedPhotos.length < MAX_PHOTOS) {

    const label = document.createElement("label");

    label.className = "photo-add-btn";

    label.innerHTML = `
      + foto

      <input
        type="file"
        accept="image/*"
        multiple
        style="display:none"
      >
    `;

    const input = label.querySelector("input");

    input.addEventListener(
      "change",
      handlePhotoSelect
    );

    photoRow.appendChild(label);
  }

  document
    .querySelectorAll(".photo-remove-btn")
    .forEach(button => {

      button.addEventListener("click", () => {

        const index =
          Number(button.dataset.index);

        selectedPhotos.splice(index, 1);

        renderPhotoSelector();
      });
    });
}

async function handlePhotoSelect(event) {

  const files =
    Array.from(event.target.files || []);

  if (!files.length) return;

  const remaining =
    MAX_PHOTOS - selectedPhotos.length;

  if (remaining <= 0) {

    showError(
      `Maximo de ${MAX_PHOTOS} fotos por ferramenta.`
    );

    return;
  }

  const filesToAdd =
    files.slice(0, remaining);

  if (files.length > remaining) {

    showError(
      `Maximo de ${MAX_PHOTOS} fotos por ferramenta. Algumas imagens nao foram adicionadas.`
    );

  } else {

    clearError();
  }

  try {

    for (const file of filesToAdd) {

      if (file.size > MAX_PHOTO_BYTES) {

        showError(
          `A imagem "${file.name}" e muito grande. Use fotos menores.`
        );

        continue;
      }

      const url =
        await fileToDataUrl(file);

      selectedPhotos.push(url);
    }

    selectedPhotos =
      selectedPhotos.slice(0, MAX_PHOTOS);

    renderPhotoSelector();

  } catch (error) {

    console.error(error);

    showError(
      "Nao foi possivel carregar uma das imagens."
    );
  }
}

/* =========================
   FERRAMENTAS
========================= */

function addTool() {

  const name =
    document
      .getElementById("toolName")
      .value
      .trim();

  const code =
    document
      .getElementById("toolCode")
      .value
      .trim();

  const value =
    document
      .getElementById("toolValue")
      .value;

  if (!name) {

    showError(
      "Digite o nome da ferramenta."
    );

    return;
  }

  const tool = {

    id: uid(),

    name,

    code,

    value:
      value !== ""
        ? Number(value)
        : null,

    photos: [...selectedPhotos]
  };

  tools.push(tool);

  saveData();

  resetAddForm();

  render();
}

function removeTool(toolId) {

  const tool =
    tools.find(tool => tool.id === toolId);

  if (!tool) return;

  const confirmed =
    confirm(
      `Remover a ferramenta "${tool.name}"?`
    );

  if (!confirmed) return;

  tools =
    tools.filter(
      tool => tool.id !== toolId
    );

  // Remove também empréstimos dessa ferramenta
  loans =
    loans.filter(
      loan => loan.toolId !== toolId
    );

  saveData();

  render();
}

function resetAddForm() {

  document.getElementById("toolName").value = "";
  document.getElementById("toolCode").value = "";
  document.getElementById("toolValue").value = "";

  selectedPhotos = [];

  renderPhotoSelector();

  document
    .getElementById("addToolCard")
    .classList.add("hidden");

  clearError();
}

/* =========================
   EMPRÉSTIMOS
========================= */

function getActiveLoan(toolId) {

  return loans.find(
    loan =>
      loan.toolId === toolId &&
      !loan.returnDate
  );
}

function openLoanModal(tool) {

  loanTool = tool;

  document.getElementById(
    "loanTitle"
  ).textContent =
    `Emprestar "${tool.name}"`;

  document.getElementById(
    "borrowerName"
  ).value = "";

  document
    .getElementById("loanError")
    .classList.add("hidden");

  document
    .getElementById("loanOverlay")
    .classList.remove("hidden");

  setTimeout(() => {

    document
      .getElementById("borrowerName")
      .focus();

  }, 50);
}

function closeLoanModal() {

  loanTool = null;

  document
    .getElementById("loanOverlay")
    .classList.add("hidden");
}

function confirmLoan() {

  if (!loanTool) return;

  const input =
    document.getElementById(
      "borrowerName"
    );

  const name =
    input.value.trim();

  if (!name) {

    const error =
      document.getElementById(
        "loanError"
      );

    error.textContent =
      "Digite o nome de quem vai levar a ferramenta.";

    error.classList.remove("hidden");

    return;
  }

  const existing =
    getActiveLoan(loanTool.id);

  if (existing) {

    const error =
      document.getElementById(
        "loanError"
      );

    error.textContent =
      "Essa ferramenta ja esta emprestada.";

    error.classList.remove("hidden");

    return;
  }

  const loan = {

    id: uid(),

    toolId: loanTool.id,

    borrower: name,

    loanDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    returnDate: null
  };

  loans.push(loan);

  saveData();

  closeLoanModal();

  render();
}

function returnTool(loanId) {

  const loan =
    loans.find(
      loan => loan.id === loanId
    );

  if (!loan) return;

  loan.returnDate =
    new Date()
      .toISOString()
      .slice(0, 10);

  saveData();

  render();
}

/* =========================
   PREVIEW DAS FOTOS
========================= */

function openPreview(tool) {

  previewTool = tool;

  document.getElementById(
    "previewTitle"
  ).textContent = tool.name;

  const container =
    document.getElementById(
      "previewPhotos"
    );

  container.innerHTML = "";

  tool.photos.forEach(
    (src, index) => {

      const img =
        document.createElement("img");

      img.src = src;

      img.alt =
        `Foto ${index + 1}`;

      img.className =
        "preview-photo";

      container.appendChild(img);
    }
  );

  document
    .getElementById("previewOverlay")
    .classList.remove("hidden");
}

function closePreview() {

  previewTool = null;

  document
    .getElementById("previewOverlay")
    .classList.add("hidden");
}

/* =========================
   RENDER
========================= */

function render() {

  renderStats();

  renderTools();

  updateFilters();
}

function renderStats() {

  const totalTools =
    document.getElementById(
      "totalTools"
    );

  const totalLoaned =
    document.getElementById(
      "totalLoaned"
    );

  totalTools.textContent =
    tools.length;

  const loaned =
    tools.filter(
      tool => getActiveLoan(tool.id)
    ).length;

  totalLoaned.textContent =
    loaned;

  const loanedStat =
    document.getElementById(
      "loanedStat"
    );

  if (loaned > 0) {

    loanedStat.classList.add(
      "loaned"
    );

  } else {

    loanedStat.classList.remove(
      "loaned"
    );
  }
}

function getFilteredTools() {

  const query =
    search
      .trim()
      .toLowerCase();

  return tools

    .filter(tool => {

      if (!query) return true;

      return (
        tool.name
          .toLowerCase()
          .includes(query) ||

        tool.code
          .toLowerCase()
          .includes(query)
      );
    })

    .filter(tool => {

      const loan =
        getActiveLoan(tool.id);

      if (
        currentFilter ===
        "disponiveis"
      ) {
        return !loan;
      }

      if (
        currentFilter ===
        "emprestadas"
      ) {
        return !!loan;
      }

      return true;
    })

    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "pt-BR"
        )
    );
}

function renderTools() {

  const list =
    document.getElementById(
      "toolsList"
    );

  const empty =
    document.getElementById(
      "emptyState"
    );

  const rows =
    getFilteredTools();

  list.innerHTML = "";

  if (rows.length === 0) {

    empty.classList.remove(
      "hidden"
    );

    if (tools.length === 0) {

      empty.textContent =
        'Nenhuma ferramenta cadastrada ainda. Clique em "Nova ferramenta" para comecar.';

    } else {

      empty.textContent =
        "Nenhuma ferramenta encontrada com esse filtro.";
    }

  } else {

    empty.classList.add(
      "hidden"
    );
  }

  rows.forEach(tool => {

    const loan =
      getActiveLoan(tool.id);

    const card =
      document.createElement("div");

    card.className =
      "tag-card";

    /* FOTO */

    let photoHTML;

    if (
      tool.photos &&
      tool.photos.length > 0
    ) {

      photoHTML = `
        <img
          src="${tool.photos[0]}"
          alt="${escapeHTML(tool.name)}"
          class="card-thumb"
          data-preview="${tool.id}"
        >
      `;

    } else {

      photoHTML = `
        <div class="card-thumb-placeholder"></div>
      `;
    }

    /* STATUS */

    let statusHTML;

    if (loan) {

      statusHTML = `
        <div>
          <div class="status-loaned-title">
            com ${escapeHTML(loan.borrower)}
          </div>

          <div class="status-loaned-sub">
            desde ${formatDate(loan.loanDate)}
            -
            ${diasEmprestada(loan.loanDate)}
            dia(s)
          </div>
        </div>
      `;

    } else {

      statusHTML = `
        <div class="status-available">
          Disponivel
        </div>
      `;
    }

    /* BOTÃO */

    let actionHTML;

    if (loan) {

      actionHTML = `
        <button
          class="return-btn"
          data-return="${loan.id}"
        >
          Registrar devolucao
        </button>
      `;

    } else {

      actionHTML = `
        <button
          class="loan-btn"
          data-loan="${tool.id}"
        >
          Registrar emprestimo
        </button>
      `;
    }

    card.innerHTML = `

      <div class="punch-hole"></div>

      ${photoHTML}

      <div class="tag-body">

        <div class="tag-main">

          <div class="tag-name">
            ${escapeHTML(tool.name)}
          </div>

          <div class="tag-meta-row">

            ${
              tool.code
                ? `<span class="tag-code">
                    #${escapeHTML(tool.code)}
                  </span>`
                : ""
            }

            ${
              tool.value !== null &&
              tool.value !== undefined
                ? `<span class="tag-value">
                    ${formatMoney(tool.value)}
                  </span>`
                : ""
            }

          </div>

        </div>

        <div class="tag-status">
          ${statusHTML}
        </div>

      </div>

      <div class="tag-actions">

        ${actionHTML}

        <button
          class="remove-btn"
          data-remove="${tool.id}"
        >
          remover
        </button>

      </div>
    `;

    list.appendChild(card);
  });

  attachToolEvents();
}

/* =========================
   EVENTOS DOS CARDS
========================= */

function attachToolEvents() {

  document
    .querySelectorAll("[data-loan]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const tool =
            tools.find(
              tool =>
                tool.id ===
                button.dataset.loan
            );

          if (tool) {
            openLoanModal(tool);
          }
        }
      );
    });

  document
    .querySelectorAll("[data-return]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          returnTool(
            button.dataset.return
          );
        }
      );
    });

  document
    .querySelectorAll("[data-remove]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          removeTool(
            button.dataset.remove
          );
        }
      );
    });

  document
    .querySelectorAll("[data-preview]")
    .forEach(image => {

      image.addEventListener(
        "click",
        () => {

          const tool =
            tools.find(
              tool =>
                tool.id ===
                image.dataset.preview
            );

          if (tool) {
            openPreview(tool);
          }
        }
      );
    });
}

/* =========================
   FILTROS
========================= */

function updateFilters() {

  document
    .querySelectorAll(".filter-btn")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.filter ===
          currentFilter
      );
    });
}

/* =========================
   SEGURANÇA DO HTML
========================= */

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   EVENTOS GERAIS
========================= */

document
  .getElementById("addToolBtn")
  .addEventListener("click", () => {

    clearError();

    document
      .getElementById("addToolCard")
      .classList.remove("hidden");

    document
      .getElementById("toolName")
      .focus();
  });

document
  .getElementById("cancelAddBtn")
  .addEventListener(
    "click",
    resetAddForm
  );

document
  .getElementById("saveToolBtn")
  .addEventListener(
    "click",
    addTool
  );

document
  .getElementById("searchInput")
  .addEventListener(
    "input",
    event => {

      search =
        event.target.value;

      renderTools();
    }
  );

document
  .querySelectorAll(".filter-btn")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        currentFilter =
          button.dataset.filter;

        updateFilters();

        renderTools();
      }
    );
  });

document
  .getElementById("confirmLoanBtn")
  .addEventListener(
    "click",
    confirmLoan
  );

document
  .getElementById("cancelLoanBtn")
  .addEventListener(
    "click",
    closeLoanModal
  );

document
  .getElementById("closePreviewBtn")
  .addEventListener(
    "click",
    closePreview
  );

/* Enter para confirmar empréstimo */

document
  .getElementById("borrowerName")
  .addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {
        confirmLoan();
      }
    }
  );

/* Clicar fora do preview fecha */

document
  .getElementById("previewOverlay")
  .addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "previewOverlay"
      ) {
        closePreview();
      }
    }
  );

/* Clicar fora do modal de empréstimo */

document
  .getElementById("loanOverlay")
  .addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "loanOverlay"
      ) {
        closeLoanModal();
      }
    }
  );

/* =========================
   INICIALIZAÇÃO
========================= */

loadData();

render();

renderPhotoSelector();
