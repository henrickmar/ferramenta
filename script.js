const STORAGE_KEY = "controle-ferramentas:dados";

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 900_000;

const COLORS = {
  bg: "#F5F3EC",
  ink: "#33322D",
  steel: "#3E5C76",
  yellow: "#F2B705",
  rust: "#C1440E",
  cardBg: "#FFFFFF",
  border: "#DEDACC",
  muted: "#847F6E",
};

const uid = () => Math.random().toString(36).slice(2, 10);

const EMPTY_TOOL = {
  name: "",
  code: "",
  value: "",
  obraId: "",
  photos: []
};

const EMPTY_OBRA = {
  name: "",
  engenheiro: "",
  mestre: ""
};

const EMPTY_RENTED = {
  name: "",
  dailyValue: "",
  rentalPlace: "",
  obraId: ""
};

let state = {
  page: "proprias",

  tools: [],
  loans: [],
  obras: [],
  rentedTools: [],
  history: [],

  search: "",
  filter: "todas",
  codeFilter: "",
  obraFilter: "",
  dateFrom: "",
  dateTo: "",

  historySearch: "",
  historyCodeFilter: "",
  historyObraFilter: "",
  historyDateFrom: "",
  historyDateTo: "",

  reportObraId: "",

  showAddTool: false,
  showAddObra: false,
  showAddRented: false,

  newTool: { ...EMPTY_TOOL },
  newObra: { ...EMPTY_OBRA },
  newRented: { ...EMPTY_RENTED },

  loanModal: null,
  borrowerName: "",

  preview: null,
  toolDetail: null,
  toolEditForm: null,

  error: "",
  saving: false
};


// ============================================================
// LOCAL STORAGE
// ============================================================

function saveData() {
  try {
    state.saving = true;
    render();

    const data = {
      tools: state.tools,
      loans: state.loans,
      obras: state.obras,
      rentedTools: state.rentedTools,
      history: state.history
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error(error);
    state.error = "Não foi possível salvar os dados.";
  } finally {
    state.saving = false;
    render();
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return;

    const data = JSON.parse(raw);

    state.tools = data.tools || [];
    state.loans = data.loans || [];
    state.obras = data.obras || [];
    state.rentedTools = data.rentedTools || [];
    state.history = data.history || [];

  } catch (error) {
    console.error(error);
    state.error = "Não foi possível carregar os dados.";
  }
}


// ============================================================
// UTILITÁRIOS
// ============================================================

function escapeHTML(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function diasEmprestada(iso) {
  const ms =
    Date.now() -
    new Date(iso + "T00:00:00").getTime();

  return Math.max(0, Math.floor(ms / 86400000));
}

function formatMoney(value) {
  const n = Number(value);

  if (!n && n !== 0) return "";

  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function obraById(id) {
  return state.obras.find(o => o.id === id);
}

function getActiveLoan(toolId) {
  return state.loans.find(
    loan => loan.toolId === toolId && !loan.returnDate
  );
}

function historyLabel(type) {
  switch (type) {
    case "cadastro":
      return "Cadastro";

    case "alocacao":
      return "Alocação";

    case "devolucao":
      return "Devolução";

    case "obra":
      return "Troca de obra";

    case "remocao":
      return "Remoção";

    case "edicao":
      return "Edição";

    default:
      return type;
  }
}

function historyBadgeClass(type) {
  return `history-badge history-${type}`;
}


// ============================================================
// HISTÓRICO
// ============================================================

function logHistory(entry) {
  state.history.unshift({
    id: uid(),
    date: today(),
    ...entry
  });
}


// ============================================================
// NAVEGAÇÃO
// ============================================================

function setPage(page) {
  state.page = page;
  state.error = "";

  closeModals();

  render();
}


// ============================================================
// FERRAMENTAS
// ============================================================

function addTool() {
  const name = state.newTool.name.trim();

  if (!name) {
    state.error = "Digite o nome da ferramenta.";
    render();
    return;
  }

  const tool = {
    id: uid(),

    name,

    code: state.newTool.code.trim(),

    value:
      state.newTool.value !== ""
        ? Number(state.newTool.value)
        : null,

    obraId:
      state.newTool.obraId || null,

    photos: state.newTool.photos || [],

    createdAt: today()
  };

  state.tools.push(tool);

  const obra = obraById(tool.obraId);

  logHistory({
    toolId: tool.id,
    toolName: tool.name,
    toolCode: tool.code,
    obraId: tool.obraId,

    type: "cadastro",

    description: obra
      ? `Ferramenta cadastrada, já alocada na obra ${obra.name}`
      : "Ferramenta cadastrada"
  });

  state.newTool = { ...EMPTY_TOOL };
  state.showAddTool = false;
  state.error = "";

  saveData();
}

function removeTool(toolId) {
  const tool = state.tools.find(t => t.id === toolId);

  if (!tool) return;

  if (
    !confirm(
      `Tem certeza que deseja remover "${tool.name}"?`
    )
  ) {
    return;
  }

  state.tools = state.tools.filter(
    tool => tool.id !== toolId
  );

  logHistory({
    toolId,
    toolName: tool.name,
    toolCode: tool.code,
    obraId: tool.obraId,

    type: "remocao",

    description: "Ferramenta removida do cadastro"
  });

  saveData();
}


// ============================================================
// FOTOS
// ============================================================

async function handlePhotoSelect(event) {
  const files = Array.from(event.target.files || []);

  event.target.value = "";

  if (!files.length) return;

  const remaining =
    MAX_PHOTOS - state.newTool.photos.length;

  if (remaining <= 0) {
    state.error =
      `Máximo de ${MAX_PHOTOS} fotos por ferramenta.`;

    render();
    return;
  }

  const selected = files.slice(0, remaining);

  for (const file of selected) {
    if (file.size > MAX_PHOTO_BYTES) {
      state.error =
        `A imagem "${file.name}" é muito grande. Use fotos menores.`;

      continue;
    }

    try {
      const dataUrl = await fileToDataUrl(file);

      state.newTool.photos.push(dataUrl);

    } catch (error) {
      state.error =
        "Não foi possível carregar uma das imagens.";
    }
  }

  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);

    reader.onerror = () =>
      reject(new Error("Falha ao ler imagem"));

    reader.readAsDataURL(file);
  });
}

function removeNewPhoto(index) {
  state.newTool.photos =
    state.newTool.photos.filter(
      (_, i) => i !== index
    );

  render();
}


// ============================================================
// EMPRÉSTIMO
// ============================================================

function openLoanModal(toolId) {
  const tool = state.tools.find(
    tool => tool.id === toolId
  );

  if (!tool) return;

  state.loanModal = tool;
  state.borrowerName = "";
  state.error = "";

  render();
}

function confirmLoan() {
  const name = state.borrowerName.trim();

  if (!name) {
    state.error =
      "Digite o nome de quem vai levar a ferramenta.";

    render();
    return;
  }

  const tool = state.loanModal;

  const loan = {
    id: uid(),

    toolId: tool.id,

    borrower: name,

    loanDate: today(),

    returnDate: null
  };

  state.loans.push(loan);

  logHistory({
    toolId: tool.id,
    toolName: tool.name,
    toolCode: tool.code,
    obraId: tool.obraId,

    type: "alocacao",

    description: `Alocada para ${name}`
  });

  state.loanModal = null;
  state.borrowerName = "";
  state.error = "";

  saveData();
}

function returnTool(loanId) {
  const loan = state.loans.find(
    l => l.id === loanId
  );

  if (!loan) return;

  const tool = state.tools.find(
    t => t.id === loan.toolId
  );

  loan.returnDate = today();

  logHistory({
    toolId: loan.toolId,
    toolName: tool ? tool.name : "",
    toolCode: tool ? tool.code : "",
    obraId: tool ? tool.obraId : null,

    type: "devolucao",

    description:
      `Devolvida por ${loan.borrower}`
  });

  saveData();
}


// ============================================================
// DETALHES / EDIÇÃO
// ============================================================

function openToolDetail(toolId) {
  const tool = state.tools.find(
    t => t.id === toolId
  );

  if (!tool) return;

  state.toolDetail = tool;

  state.toolEditForm = {
    name: tool.name,

    value:
      tool.value !== null &&
      tool.value !== undefined
        ? String(tool.value)
        : "",

    obraId: tool.obraId || ""
  };

  state.error = "";

  render();
}

function saveToolDetail() {
  const tool = state.toolDetail;

  if (!tool) return;

  const newName =
    state.toolEditForm.name.trim();

  if (!newName) {
    state.error =
      "O nome da ferramenta não pode ficar vazio.";

    render();
    return;
  }

  const newValue =
    state.toolEditForm.value !== ""
      ? Number(state.toolEditForm.value)
      : null;

  const newObraId =
    state.toolEditForm.obraId || null;

  const events = [];

  if (newName !== tool.name) {
    events.push({
      toolId: tool.id,
      toolName: newName,
      toolCode: tool.code,
      obraId: newObraId,

      type: "edicao",

      description:
        `Nome alterado de "${tool.name}" para "${newName}"`
    });
  }

  if (newValue !== tool.value) {
    events.push({
      toolId: tool.id,
      toolName: newName,
      toolCode: tool.code,
      obraId: newObraId,

      type: "edicao",

      description:
        tool.value !== null
          ? `Valor alterado de ${formatMoney(tool.value)} para ${
              newValue !== null
                ? formatMoney(newValue)
                : "vazio"
            }`
          : `Valor definido como ${
              newValue !== null
                ? formatMoney(newValue)
                : "vazio"
            }`
    });
  }

  if (
    newObraId !==
    (tool.obraId || null)
  ) {
    const oldObra =
      obraById(tool.obraId);

    const newObra =
      obraById(newObraId);

    let description = "";

    if (oldObra && newObra) {
      description =
        `Trocou de obra: ${oldObra.name} -> ${newObra.name}`;
    } else if (newObra) {
      description =
        `Alocada na obra ${newObra.name}`;
    } else if (oldObra) {
      description =
        `Removida da obra ${oldObra.name}`;
    }

    events.push({
      toolId: tool.id,
      toolName: newName,
      toolCode: tool.code,
      obraId: newObraId,

      type: "obra",

      description
    });
  }

  if (!events.length) {
    closeModals();
    render();
    return;
  }

  tool.name = newName;
  tool.value = newValue;
  tool.obraId = newObraId;

  events.forEach(event => {
    logHistory(event);
  });

  closeModals();

  state.error = "";

  saveData();
}


// ============================================================
// OBRAS
// ============================================================

function addObra() {
  const name = state.newObra.name.trim();

  if (!name) {
    state.error = "Digite o nome da obra.";
    render();
    return;
  }

  const obra = {
    id: uid(),

    name,

    engenheiro:
      state.newObra.engenheiro.trim(),

    mestre:
      state.newObra.mestre.trim()
  };

  state.obras.push(obra);

  state.newObra = { ...EMPTY_OBRA };

  state.showAddObra = false;

  state.error = "";

  saveData();
}

function removeObra(obraId) {
  const obra = obraById(obraId);

  if (!obra) return;

  if (
    !confirm(
      `Remover a obra "${obra.name}"?`
    )
  ) {
    return;
  }

  state.obras =
    state.obras.filter(
      obra => obra.id !== obraId
    );

  // Remove o vínculo das ferramentas
  state.tools.forEach(tool => {
    if (tool.obraId === obraId) {
      tool.obraId = null;
    }
  });

  // Remove o vínculo das alugadas
  state.rentedTools.forEach(tool => {
    if (tool.obraId === obraId) {
      tool.obraId = null;
    }
  });

  saveData();
}


// ============================================================
// FERRAMENTAS ALUGADAS
// ============================================================

function addRentedTool() {
  const name =
    state.newRented.name.trim();

  if (!name) {
    state.error =
      "Digite o nome da ferramenta alugada.";

    render();
    return;
  }

  const rented = {
    id: uid(),

    name,

    dailyValue:
      state.newRented.dailyValue !== ""
        ? Number(state.newRented.dailyValue)
        : null,

    rentalPlace:
      state.newRented.rentalPlace.trim(),

    obraId:
      state.newRented.obraId || null
  };

  state.rentedTools.push(rented);

  state.newRented = { ...EMPTY_RENTED };

  state.showAddRented = false;

  state.error = "";

  saveData();
}

function removeRentedTool(id) {
  state.rentedTools =
    state.rentedTools.filter(
      rented => rented.id !== id
    );

  saveData();
}


// ============================================================
// FILTROS
// ============================================================

function getFilteredTools() {
  return state.tools
    .map(tool => ({
      tool,
      loan: getActiveLoan(tool.id)
    }))

    .filter(({ tool }) => {
      const q =
        state.search.trim().toLowerCase();

      if (
        q &&
        !tool.name
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }

      return true;
    })

    .filter(({ tool }) => {
      const q =
        state.codeFilter
          .trim()
          .toLowerCase();

      if (
        q &&
        !(tool.code || "")
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }

      return true;
    })

    .filter(({ tool }) => {
      if (
        state.obraFilter &&
        tool.obraId !==
          state.obraFilter
      ) {
        return false;
      }

      return true;
    })

    .filter(({ tool }) => {
      if (
        state.dateFrom &&
        tool.createdAt &&
        tool.createdAt <
          state.dateFrom
      ) {
        return false;
      }

      if (
        state.dateTo &&
        tool.createdAt &&
        tool.createdAt >
          state.dateTo
      ) {
        return false;
      }

      return true;
    })

    .filter(({ loan }) => {
      if (
        state.filter === "disponiveis"
      ) {
        return !loan;
      }

      if (
        state.filter === "emprestadas"
      ) {
        return !!loan;
      }

      return true;
    })

    .sort((a, b) =>
      a.tool.name.localeCompare(
        b.tool.name,
        "pt-BR"
      )
    );
}

function getFilteredHistory() {
  return state.history

    .filter(history => {
      const q =
        state.historySearch
          .trim()
          .toLowerCase();

      if (
        q &&
        !(history.toolName || "")
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }

      return true;
    })

    .filter(history => {
      const q =
        state.historyCodeFilter
          .trim()
          .toLowerCase();

      if (
        q &&
        !(history.toolCode || "")
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }

      return true;
    })

    .filter(history => {
      if (
        state.historyObraFilter &&
        history.obraId !==
          state.historyObraFilter
      ) {
        return false;
      }

      return true;
    })

    .filter(history => {
      if (
        state.historyDateFrom &&
        history.date <
          state.historyDateFrom
      ) {
        return false;
      }

      if (
        state.historyDateTo &&
        history.date >
          state.historyDateTo
      ) {
        return false;
      }

      return true;
    });
}


// ============================================================
// MODAIS
// ============================================================

function closeModals() {
  state.loanModal = null;
  state.preview = null;
  state.toolDetail = null;
  state.toolEditForm = null;

  state.error = "";
}

function closeAddTool() {
  state.showAddTool = false;
  state.newTool = { ...EMPTY_TOOL };
  state.error = "";

  render();
}

function closeAddObra() {
  state.showAddObra = false;
  state.newObra = { ...EMPTY_OBRA };
  state.error = "";

  render();
}

function closeAddRented() {
  state.showAddRented = false;
  state.newRented = { ...EMPTY_RENTED };
  state.error = "";

  render();
}


// ============================================================
// HTML
// ============================================================

function renderSidebar() {
  return `
    <nav class="sidebar">

      <div class="sidebar-brand">
        <div class="sidebar-brand-mark">FT</div>
        <div class="sidebar-brand-text">
          Ferramentaria
        </div>
      </div>

      <button
        class="nav-item ${
          state.page === "proprias"
            ? "active"
            : ""
        }"
        data-action="page"
        data-page="proprias"
      >
        Ferramentas Próprias
      </button>

      <button
        class="nav-item ${
          state.page === "alugadas"
            ? "active"
            : ""
        }"
        data-action="page"
        data-page="alugadas"
      >
        Ferramentas Alugadas
      </button>

      <button
        class="nav-item ${
          state.page === "obras"
            ? "active"
            : ""
        }"
        data-action="page"
        data-page="obras"
      >
        Obras
      </button>

      <button
        class="nav-item ${
          state.page === "historico"
            ? "active"
            : ""
        }"
        data-action="page"
        data-page="historico"
      >
        Histórico
      </button>

      <button
        class="nav-item ${
          state.page === "relatorios"
            ? "active"
            : ""
        }"
        data-action="page"
        data-page="relatorios"
      >
        Relatórios
      </button>

    </nav>
  `;
}

function renderHeader(
  eyebrow,
  title,
  number,
  label
) {
  return `
    <header class="header">

      <div>
        <div class="eyebrow">
          ${eyebrow}
        </div>

        <h1 class="title">
          ${title}
        </h1>
      </div>

      ${
        number !== undefined
          ? `
            <div class="header-stats">
              <div class="stat-block">
                <div class="stat-number">
                  ${number}
                </div>

                <div class="stat-label">
                  ${label}
                </div>
              </div>
            </div>
          `
          : ""
      }

    </header>
  `;
}


// ============================================================
// PÁGINA FERRAMENTAS PRÓPRIAS
// ============================================================

function renderProprias() {
  const rows = getFilteredTools();

  const totalEmprestadas =
    state.tools.filter(
      tool => getActiveLoan(tool.id)
    ).length;

  return `

    ${renderHeader(
      "CONTROLE DE FERRAMENTAS",
      "Ferramentas Próprias",
      state.tools.length,
      "cadastradas"
    )}

    <div class="toolbar">

      <input
        class="search-input"
        placeholder="Buscar por nome"
        value="${escapeHTML(state.search)}"
        data-field="search"
      />

      <div class="filter-group">

        <button
          class="filter-btn ${
            state.filter === "todas"
              ? "active"
              : ""
          }"
          data-filter="todas"
        >
          Todas
        </button>

        <button
          class="filter-btn ${
            state.filter === "disponiveis"
              ? "active"
              : ""
          }"
          data-filter="disponiveis"
        >
          Disponíveis
        </button>

        <button
          class="filter-btn ${
            state.filter === "emprestadas"
              ? "active"
              : ""
          }"
          data-filter="emprestadas"
        >
          Alocadas
        </button>

      </div>

      <button
        class="add-btn"
        data-action="show-add-tool"
      >
        + Nova ferramenta
      </button>

    </div>


    <div class="filter-bar">

      <input
        class="filter-input"
        placeholder="Filtrar por código"
        value="${escapeHTML(
          state.codeFilter
        )}"
        data-field="codeFilter"
      />

      <select
        class="filter-input"
        data-field="obraFilter"
      >
        <option value="">
          Todas as obras
        </option>

        ${state.obras.map(obra => `
          <option
            value="${obra.id}"
            ${
              state.obraFilter === obra.id
                ? "selected"
                : ""
            }
          >
            ${escapeHTML(obra.name)}
          </option>
        `).join("")}

      </select>

      <label>
        Cadastrada de
        <input
          type="date"
          class="filter-input"
          value="${state.dateFrom}"
          data-field="dateFrom"
        />
      </label>

      <label>
        até
        <input
          type="date"
          class="filter-input"
          value="${state.dateTo}"
          data-field="dateTo"
        />
      </label>

      ${
        state.codeFilter ||
        state.obraFilter ||
        state.dateFrom ||
        state.dateTo
          ? `
            <button
              class="clear-filter-btn"
              data-action="clear-filters"
            >
              Limpar filtros
            </button>
          `
          : ""
      }

    </div>


    ${
      state.showAddTool
        ? renderAddTool()
        : ""
    }


    ${
      rows.length === 0
        ? `
          <div class="empty-state">
            ${
              state.tools.length === 0
                ? "Nenhuma ferramenta cadastrada ainda."
                : "Nenhuma ferramenta encontrada com esse filtro."
            }
          </div>
        `
        : `
          <div class="list">
            ${rows
              .map(renderToolCard)
              .join("")}
          </div>
        `
    }

  `;
}


// ============================================================
// FORMULÁRIO NOVA FERRAMENTA
// ============================================================

function renderAddTool() {
  return `
    <div class="inline-card">

      <div class="inline-card-title">
        Cadastrar ferramenta
      </div>

      <div class="inline-card-row">

        <input
          class="text-input"
          placeholder="Nome da ferramenta"
          value="${escapeHTML(
            state.newTool.name
          )}"
          data-new-tool="name"
        />

        <input
          class="text-input"
          placeholder="Código / etiqueta"
          value="${escapeHTML(
            state.newTool.code
          )}"
          data-new-tool="code"
        />

        <input
          type="number"
          min="0"
          step="0.01"
          class="text-input small"
          placeholder="Valor (R$)"
          value="${escapeHTML(
            state.newTool.value
          )}"
          data-new-tool="value"
        />

      </div>

      <div class="inline-card-row">

        <select
          class="select-input"
          data-new-tool="obraId"
        >

          <option value="">
            Sem obra vinculada
          </option>

          ${state.obras.map(obra => `
            <option
              value="${obra.id}"
              ${
                state.newTool.obraId === obra.id
                  ? "selected"
                  : ""
              }
            >
              ${escapeHTML(obra.name)}
            </option>
          `).join("")}

        </select>

      </div>


      <div class="photo-section">

        <label>
          Fotos (até ${MAX_PHOTOS})
        </label>

        <div class="photo-row">

          ${state.newTool.photos.map(
            (photo, index) => `
              <div class="photo-thumb-wrap">

                <img
                  src="${photo}"
                  class="photo-thumb"
                />

                <button
                  class="photo-remove-btn"
                  data-action="remove-photo"
                  data-index="${index}"
                >
                  ×
                </button>

              </div>
            `
          ).join("")}


          ${
            state.newTool.photos.length <
            MAX_PHOTOS
              ? `
                <label class="photo-add-btn">

                  + foto

                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    id="photo-input"
                    hidden
                  />

                </label>
              `
              : ""
          }

        </div>

      </div>


      <div class="inline-card-actions">

        <button
          class="ghost-btn"
          data-action="cancel-add-tool"
        >
          Cancelar
        </button>

        <button
          class="primary-btn"
          data-action="add-tool"
        >
          Salvar
        </button>

      </div>

    </div>
  `;
}


// ============================================================
// CARD DE FERRAMENTA
// ============================================================

function renderToolCard({
  tool,
  loan
}) {
  const obra = obraById(tool.obraId);

  return `
    <div class="tag-card">

      <div class="punch-hole"></div>

      ${
        tool.photos &&
        tool.photos.length
          ? `
            <img
              src="${tool.photos[0]}"
              class="card-thumb"
              data-action="preview"
              data-id="${tool.id}"
            />
          `
          : `
            <div class="card-thumb-placeholder"></div>
          `
      }


      <div class="tag-body">

        <div class="tag-main">

          <div
            class="tag-name clickable"
            data-action="detail"
            data-id="${tool.id}"
          >
            ${escapeHTML(tool.name)}
          </div>

          <div class="tag-meta-row">

            ${
              tool.code
                ? `<span>#${escapeHTML(tool.code)}</span>`
                : ""
            }

            ${
              tool.value !== null
                ? `<span>${formatMoney(
                    tool.value
                  )}</span>`
                : ""
            }

            ${
              obra
                ? `<span class="tag-obra">
                    ${escapeHTML(obra.name)}
                  </span>`
                : ""
            }

          </div>

        </div>


        <div class="tag-status">

          ${
            loan
              ? `
                <div class="status-loaned-title">
                  com ${escapeHTML(
                    loan.borrower
                  )}
                </div>

                <div class="status-loaned-sub">
                  desde ${formatDate(
                    loan.loanDate
                  )}
                  -
                  ${diasEmprestada(
                    loan.loanDate
                  )}
                  dia(s)
                </div>
              `
              : `
                <div class="status-available">
                  Disponível
                </div>
              `
          }

        </div>

      </div>


      <div class="tag-actions">

        ${
          loan
            ? `
              <button
                class="return-btn"
                data-action="return"
                data-id="${loan.id}"
              >
                Registrar devolução
              </button>
            `
            : `
              <button
                class="loan-btn"
                data-action="loan"
                data-id="${tool.id}"
              >
                Registrar empréstimo
              </button>
            `
        }

        <button
          class="ghost-btn"
          data-action="detail"
          data-id="${tool.id}"
        >
          Detalhes
        </button>

        <button
          class="remove-btn"
          data-action="remove-tool"
          data-id="${tool.id}"
        >
          remover
        </button>

      </div>

    </div>
  `;
}


// ============================================================
// PÁGINA OBRAS
// ============================================================

function renderObras() {
  return `

    ${renderHeader(
      "CADASTRO DE OBRAS",
      "Obras",
      state.obras.length,
      "cadastradas"
    )}

    <div class="toolbar">

      <div></div>

      <button
        class="add-btn"
        data-action="show-add-obra"
      >
        + Nova obra
      </button>

    </div>


    ${
      state.showAddObra
        ? renderAddObra()
        : ""
    }


    ${
      state.obras.length === 0
        ? `
          <div class="empty-state">
            Nenhuma obra cadastrada ainda.
          </div>
        `
        : `
          <div class="list">
            ${state.obras
              .map(renderObraCard)
              .join("")}
          </div>
        `
    }

  `;
}

function renderAddObra() {
  return `
    <div class="inline-card">

      <div class="inline-card-title">
        Cadastrar obra
      </div>

      <div class="inline-card-row">

        <input
          class="text-input"
          placeholder="Nome da obra"
          value="${escapeHTML(
            state.newObra.name
          )}"
          data-new-obra="name"
        />

        <input
          class="text-input"
          placeholder="Engenheiro responsável"
          value="${escapeHTML(
            state.newObra.engenheiro
          )}"
          data-new-obra="engenheiro"
        />

        <input
          class="text-input"
          placeholder="Mestre de obra"
          value="${escapeHTML(
            state.newObra.mestre
          )}"
          data-new-obra="mestre"
        />

      </div>


      <div class="inline-card-actions">

        <button
          class="ghost-btn"
          data-action="cancel-add-obra"
        >
          Cancelar
        </button>

        <button
          class="primary-btn"
          data-action="add-obra"
        >
          Salvar
        </button>

      </div>

    </div>
  `;
}

function renderObraCard(obra) {
  const count =
    state.tools.filter(
      tool => tool.obraId === obra.id
    ).length;

  return `
    <div class="obra-card">

      <div class="obra-main">

        <div class="tag-name">
          ${escapeHTML(obra.name)}
        </div>

        <div class="obra-people-row">

          ${
            obra.engenheiro
              ? `
                <span>
                  <b>Engenheiro:</b>
                  ${escapeHTML(
                    obra.engenheiro
                  )}
                </span>
              `
              : ""
          }

          ${
            obra.mestre
              ? `
                <span>
                  <b>Mestre:</b>
                  ${escapeHTML(
                    obra.mestre
                  )}
                </span>
              `
              : ""
          }

        </div>

      </div>


      <div class="obra-right">

        <span class="obra-tool-count">
          ${count} ferramenta(s)
        </span>

        <button
          class="remove-btn"
          data-action="remove-obra"
          data-id="${obra.id}"
        >
          remover
        </button>

      </div>

    </div>
  `;
}


// ============================================================
// FERRAMENTAS ALUGADAS
// ============================================================

function renderAlugadas() {
  return `

    ${renderHeader(
      "CONTROLE DE FERRAMENTAS",
      "Ferramentas Alugadas",
      state.rentedTools.length,
      "alugadas"
    )}

    <div class="toolbar">

      <div></div>

      <button
        class="add-btn"
        data-action="show-add-rented"
      >
        + Nova ferramenta alugada
      </button>

    </div>


    ${
      state.showAddRented
        ? renderAddRented()
        : ""
    }


    ${
      state.rentedTools.length === 0
        ? `
          <div class="empty-state">
            Nenhuma ferramenta alugada cadastrada.
          </div>
        `
        : `
          <div class="list">
            ${state.rentedTools
              .map(renderRentedCard)
              .join("")}
          </div>
        `
    }

  `;
}

function renderAddRented() {
  return `
    <div class="inline-card">

      <div class="inline-card-title">
        Cadastrar ferramenta alugada
      </div>

      <div class="inline-card-row">

        <input
          class="text-input"
          placeholder="Nome da ferramenta"
          value="${escapeHTML(
            state.newRented.name
          )}"
          data-new-rented="name"
        />

        <input
          type="number"
          min="0"
          step="0.01"
          class="text-input"
          placeholder="Valor da diária"
          value="${escapeHTML(
            state.newRented.dailyValue
          )}"
          data-new-rented="dailyValue"
        />

      </div>


      <div class="inline-card-row">

        <input
          class="text-input"
          placeholder="Local onde foi alugada"
          value="${escapeHTML(
            state.newRented.rentalPlace
          )}"
          data-new-rented="rentalPlace"
        />


        <select
          class="select-input"
          data-new-rented="obraId"
        >

          <option value="">
            Sem obra vinculada
          </option>

          ${state.obras.map(obra => `
            <option
              value="${obra.id}"
              ${
                state.newRented.obraId === obra.id
                  ? "selected"
                  : ""
              }
            >
              ${escapeHTML(obra.name)}
            </option>
          `).join("")}

        </select>

      </div>


      <div class="inline-card-actions">

        <button
          class="ghost-btn"
          data-action="cancel-add-rented"
        >
          Cancelar
        </button>

        <button
          class="primary-btn"
          data-action="add-rented"
        >
          Salvar
        </button>

      </div>

    </div>
  `;
}

function renderRentedCard(tool) {
  const obra = obraById(tool.obraId);

  return `
    <div class="obra-card">

      <div class="obra-main">

        <div class="tag-name">
          ${escapeHTML(tool.name)}
        </div>

        <div class="obra-people-row">

          ${
            tool.dailyValue !== null
              ? `
                <span>
                  <b>Diária:</b>
                  ${formatMoney(
                    tool.dailyValue
                  )}
                </span>
              `
              : ""
          }

          ${
            tool.rentalPlace
              ? `
                <span>
                  <b>Local:</b>
                  ${escapeHTML(
                    tool.rentalPlace
                  )}
                </span>
              `
              : ""
          }

          ${
            obra
              ? `
                <span>
                  <b>Obra:</b>
                  ${escapeHTML(obra.name)}
                </span>
              `
              : ""
          }

        </div>

      </div>


      <div class="obra-right">

        <button
          class="remove-btn"
          data-action="remove-rented"
          data-id="${tool.id}"
        >
          remover
        </button>

      </div>

    </div>
  `;
}


// ============================================================
// HISTÓRICO
// ============================================================

function renderHistorico() {
  const history =
    getFilteredHistory();

  return `

    ${renderHeader(
      "LINHA DO TEMPO",
      "Histórico",
      state.history.length,
      "eventos"
    )}

    <div class="toolbar">

      <input
        class="search-input"
        placeholder="Buscar por nome da ferramenta"
        value="${escapeHTML(
          state.historySearch
        )}"
        data-field="historySearch"
      />

    </div>


    ${
      history.length === 0
        ? `
          <div class="empty-state">
            ${
              state.history.length === 0
                ? "Nenhum evento registrado ainda."
                : "Nenhum evento encontrado."
            }
          </div>
        `
        : `
          <div class="list">
            ${history
              .map(renderHistoryCard)
              .join("")}
          </div>
        `
    }

  `;
}

function renderHistoryCard(item) {
  return `
    <div class="history-card">

      <div class="${historyBadgeClass(
        item.type
      )}">
        ${historyLabel(item.type)}
      </div>

      <div class="history-body">

        <div class="tag-name">
          ${escapeHTML(
            item.toolName ||
            "Ferramenta removida"
          )}
        </div>

        <div class="history-description">
          ${escapeHTML(
            item.description
          )}
        </div>

      </div>

      <div class="history-date">
        ${formatDate(item.date)}
      </div>

    </div>
  `;
}


// ============================================================
// RELATÓRIOS
// ============================================================

function renderRelatorios() {
  const available =
    state.tools.filter(
      tool => !getActiveLoan(tool.id)
    );

  const owned =
    state.tools.filter(
      tool =>
        tool.obraId ===
        state.reportObraId
    );

  const rented =
    state.rentedTools.filter(
      tool =>
        tool.obraId ===
        state.reportObraId
    );

  return `

    ${renderHeader(
      "RELATÓRIOS",
      "Relatórios"
    )}


    <section class="report-section">

      <div class="report-section-header">

        <h2>
          Ferramentas disponíveis
        </h2>

        <span>
          ${available.length} ferramenta(s)
        </span>

      </div>


      ${
        available.length === 0
          ? `
            <div class="empty-state">
              Nenhuma ferramenta disponível.
            </div>
          `
          : `
            <div class="list">
              ${available
                .map(tool => `
                  <div class="report-row">

                    <div>
                      <div class="tag-name">
                        ${escapeHTML(
                          tool.name
                        )}
                      </div>

                      <div class="tag-meta-row">

                        ${
                          tool.code
                            ? `#${escapeHTML(
                                tool.code
                              )}`
                            : ""
                        }

                        ${
                          tool.value !== null
                            ? formatMoney(
                                tool.value
                              )
                            : ""
                        }

                      </div>
                    </div>

                    <span class="status-available">
                      Disponível
                    </span>

                  </div>
                `)
                .join("")}
            </div>
          `
      }

    </section>


    <section class="report-section">

      <div class="report-section-header">

        <h2>
          Ferramentas por obra
        </h2>

      </div>


      <select
        class="select-input report-select"
        data-field="reportObraId"
      >

        <option value="">
          Selecione uma obra
        </option>

        ${state.obras.map(obra => `
          <option
            value="${obra.id}"
            ${
              state.reportObraId === obra.id
                ? "selected"
                : ""
            }
          >
            ${escapeHTML(obra.name)}
          </option>
        `).join("")}

      </select>


      ${
        !state.reportObraId
          ? `
            <div class="empty-state">
              Selecione uma obra para visualizar
              suas ferramentas.
            </div>
          `
          : `
            <div class="list">

              ${owned.map(tool => {
                const loan =
                  getActiveLoan(tool.id);

                return `
                  <div class="report-row">

                    <div>
                      <div class="tag-name">
                        ${escapeHTML(
                          tool.name
                        )}

                        <small>
                          própria
                        </small>
                      </div>

                      <div class="tag-meta-row">

                        ${
                          tool.code
                            ? `#${escapeHTML(
                                tool.code
                              )}`
                            : ""
                        }

                        ${
                          tool.value !== null
                            ? formatMoney(
                                tool.value
                              )
                            : ""
                        }

                      </div>
                    </div>


                    ${
                      loan
                        ? `
                          <span class="status-loaned-title">
                            com ${escapeHTML(
                              loan.borrower
                            )}
                          </span>
                        `
                        : `
                          <span class="status-available">
                            Disponível
                          </span>
                        `
                    }

                  </div>
                `;
              }).join("")}


              ${rented.map(tool => `
                <div class="report-row">

                  <div>

                    <div class="tag-name">
                      ${escapeHTML(
                        tool.name
                      )}

                      <small>
                        alugada
                      </small>
                    </div>

                    <div class="tag-meta-row">

                      ${
                        tool.dailyValue !== null
                          ? `${formatMoney(
                              tool.dailyValue
                            )}/dia`
                          : ""
                      }

                      ${
                        tool.rentalPlace
                          ? escapeHTML(
                              tool.rentalPlace
                            )
                          : ""
                      }

                    </div>

                  </div>

                </div>
              `).join("")}

            </div>
          `
      }

    </section>

  `;
}


// ============================================================
// MODAL DE PREVIEW
// ============================================================

function renderPreviewModal() {
  if (!state.preview) return "";

  return `
    <div class="modal-overlay">

      <div class="preview-modal">

        <div class="modal-title">
          ${escapeHTML(
            state.preview.name
          )}
        </div>

        <div class="preview-photos">

          ${state.preview.photos
            .map(photo => `
              <img
                src="${photo}"
                class="preview-photo"
              />
            `)
            .join("")}

        </div>

        <div class="inline-card-actions">

          <button
            class="ghost-btn"
            data-action="close-preview"
          >
            Fechar
          </button>

        </div>

      </div>

    </div>
  `;
}


// ============================================================
// MODAL DE DETALHES
// ============================================================

function renderToolDetailModal() {
  if (
    !state.toolDetail ||
    !state.toolEditForm
  ) {
    return "";
  }

  const tool = state.toolDetail;

  const loan =
    getActiveLoan(tool.id);

  return `
    <div class="modal-overlay">

      <div class="modal">

        <div class="modal-title">
          Detalhes da ferramenta
        </div>


        ${
          tool.photos &&
          tool.photos.length
            ? `
              <div class="preview-photos">

                ${tool.photos.map(photo => `
                  <img
                    src="${photo}"
                    class="detail-photo"
                  />
                `).join("")}

              </div>
            `
            : ""
        }


        <label>
          Nome
        </label>

        <input
          class="text-input"
          value="${escapeHTML(
            state.toolEditForm.name
          )}"
          data-edit-tool="name"
        />


        <label>
          Valor (R$)
        </label>

        <input
          type="number"
          min="0"
          step="0.01"
          class="text-input"
          value="${escapeHTML(
            state.toolEditForm.value
          )}"
          data-edit-tool="value"
        />


        <label>
          Obra
        </label>

        <select
          class="select-input"
          data-edit-tool="obraId"
        >

          <option value="">
            Sem obra vinculada
          </option>

          ${state.obras.map(obra => `
            <option
              value="${obra.id}"
              ${
                state.toolEditForm.obraId === obra.id
                  ? "selected"
                  : ""
              }
            >
              ${escapeHTML(obra.name)}
            </option>
          `).join("")}

        </select>


        <div class="detail-readonly">

          ${
            tool.code
              ? `Código: #${escapeHTML(
                  tool.code
                )}`
              : ""
          }

          ${
            loan
              ? `
                <span class="status-loaned-title">
                  Alocada com ${escapeHTML(
                    loan.borrower
                  )}
                </span>
              `
              : `
                <span class="status-available">
                  Disponível
                </span>
              `
          }

        </div>


        <div class="inline-card-actions">

          <button
            class="ghost-btn"
            data-action="close-detail"
          >
            Cancelar
          </button>

          <button
            class="primary-btn"
            data-action="save-detail"
          >
            Salvar alterações
          </button>

        </div>

      </div>

    </div>
  `;
}


// ============================================================
// MODAL EMPRÉSTIMO
// ============================================================

function renderLoanModal() {
  if (!state.loanModal) return "";

  return `
    <div class="modal-overlay">

      <div class="modal">

        <div class="modal-title">
          Emprestar "${escapeHTML(
            state.loanModal.name
          )}"
        </div>

        <label>
          Quem está levando?
        </label>

        <input
          class="text-input"
          id="borrower-input"
          placeholder="Nome do colega"
          value="${escapeHTML(
            state.borrowerName
          )}"
        />


        <div class="inline-card-actions">

          <button
            class="ghost-btn"
            data-action="close-loan"
          >
            Cancelar
          </button>

          <button
            class="primary-btn"
            data-action="confirm-loan"
          >
            Confirmar empréstimo
          </button>

        </div>

      </div>

    </div>
  `;
}


// ============================================================
// RENDER PRINCIPAL
// ============================================================

function render() {
  const app =
    document.getElementById("app");

  if (!app) return;

  let content = "";

  switch (state.page) {
    case "proprias":
      content = renderProprias();
      break;

    case "alugadas":
      content = renderAlugadas();
      break;

    case "obras":
      content = renderObras();
      break;

    case "historico":
      content = renderHistorico();
      break;

    case "relatorios":
      content = renderRelatorios();
      break;
  }

  app.innerHTML = `
    <div class="shell">

      ${renderSidebar()}

      <main class="main">

        ${
          state.error
            ? `
              <div class="error-banner">
                ${escapeHTML(
                  state.error
                )}
              </div>
            `
            : ""
        }

        ${
          state.saving
            ? `
              <div class="saving-banner">
                Salvando...
              </div>
            `
            : ""
        }

        ${content}

      </main>

    </div>


    ${renderPreviewModal()}

    ${renderToolDetailModal()}

    ${renderLoanModal()}
  `;

  bindEvents();
}


// ============================================================
// EVENTOS
// ============================================================

function bindEvents() {

  // Navegação
  document
    .querySelectorAll("[data-action='page']")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          setPage(
            button.dataset.page
          );
        }
      );
    });


  // Filtros
  document
    .querySelectorAll("[data-filter]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          state.filter =
            button.dataset.filter;

          render();
        }
      );
    });


  // Campos genéricos
  document
    .querySelectorAll("[data-field]")
    .forEach(input => {

      input.addEventListener(
        "input",
        () => {
          state[
            input.dataset.field
          ] = input.value;

          render();
        }
      );

    });


  // Nova ferramenta
  document
    .querySelectorAll("[data-new-tool]")
    .forEach(input => {

      input.addEventListener(
        "input",
        () => {
          state.newTool[
            input.dataset.newTool
          ] = input.value;
        }
      );

    });


  // Nova obra
  document
    .querySelectorAll("[data-new-obra]")
    .forEach(input => {

      input.addEventListener(
        "input",
        () => {
          state.newObra[
            input.dataset.newObra
          ] = input.value;
        }
      );

    });


  // Nova alugada
  document
    .querySelectorAll("[data-new-rented]")
    .forEach(input => {

      input.addEventListener(
        "input",
        () => {
          state.newRented[
            input.dataset.newRented
          ] = input.value;
        }
      );

    });


  // Edição da ferramenta
  document
    .querySelectorAll("[data-edit-tool]")
    .forEach(input => {

      input.addEventListener(
        "input",
        () => {
          state.toolEditForm[
            input.dataset.editTool
          ] = input.value;
        }
      );

    });


  // Foto
  const photoInput =
    document.getElementById(
      "photo-input"
    );

  if (photoInput) {
    photoInput.addEventListener(
      "change",
      handlePhotoSelect
    );
  }


  // Botões de ação
  document
    .querySelectorAll("[data-action]")
    .forEach(button => {

      const action =
        button.dataset.action;

      if (
        action === "page"
      ) {
        return;
      }

      button.addEventListener(
        "click",
        () =>
          handleAction(button)
      );

    });


  // Enter no modal de empréstimo
  const borrowerInput =
    document.getElementById(
      "borrower-input"
    );

  if (borrowerInput) {

    borrowerInput.focus();

    borrowerInput.addEventListener(
      "input",
      event => {
        state.borrowerName =
          event.target.value;
      }
    );

    borrowerInput.addEventListener(
      "keydown",
      event => {
        if (event.key === "Enter") {
          confirmLoan();
        }
      }
    );

  }
}


// ============================================================
// TRATAMENTO DOS BOTÕES
// ============================================================

function handleAction(element) {

  const action =
    element.dataset.action;

  const id =
    element.dataset.id;


  switch (action) {

    case "show-add-tool":
      state.showAddTool = true;
      state.error = "";
      render();
      break;


    case "cancel-add-tool":
      closeAddTool();
      break;


    case "add-tool":
      addTool();
      break;


    case "remove-photo":
      removeNewPhoto(
        Number(element.dataset.index)
      );
      break;


    case "preview": {
      const tool =
        state.tools.find(
          t => t.id === id
        );

      if (tool) {
        state.preview = tool;
        render();
      }

      break;
    }


    case "close-preview":
      state.preview = null;
      render();
      break;


    case "loan":
      openLoanModal(id);
      break;


    case "confirm-loan":
      confirmLoan();
      break;


    case "close-loan":
      state.loanModal = null;
      state.error = "";
      render();
      break;


    case "return":
      returnTool(id);
      break;


    case "detail":
      openToolDetail(id);
      break;


    case "close-detail":
      state.toolDetail = null;
      state.toolEditForm = null;
      state.error = "";
      render();
      break;


    case "save-detail":
      saveToolDetail();
      break;


    case "remove-tool":
      removeTool(id);
      break;


    case "show-add-obra":
      state.showAddObra = true;
      state.error = "";
      render();
      break;


    case "cancel-add-obra":
      closeAddObra();
      break;


    case "add-obra":
      addObra();
      break;


    case "remove-obra":
      removeObra(id);
      break;


    case "show-add-rented":
      state.showAddRented = true;
      state.error = "";
      render();
      break;


    case "cancel-add-rented":
      closeAddRented();
      break;


    case "add-rented":
      addRentedTool();
      break;


    case "remove-rented":
      removeRentedTool(id);
      break;


    case "clear-filters":
      state.codeFilter = "";
      state.obraFilter = "";
      state.dateFrom = "";
      state.dateTo = "";
      render();
      break;

  }
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadData();

    render();

  }
);
