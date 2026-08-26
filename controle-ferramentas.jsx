import { useState, useEffect, useMemo } from "react";

const STORAGE_KEY = "controle-ferramentas:dados";

const uid = () => Math.random().toString(36).slice(2, 10);

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function diasEmprestada(iso) {
  const ms = Date.now() - new Date(iso + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function formatMoney(value) {
  const n = Number(value);
  if (!n && n !== 0) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
}

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 900_000;

export default function ControleFerramentas() {
  const [tools, setTools] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");

  const [showAddTool, setShowAddTool] = useState(false);
  const [newTool, setNewTool] = useState({ name: "", code: "", value: "", photos: [] });
  const [photoLoading, setPhotoLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const [loanModal, setLoanModal] = useState(null);
  const [borrowerName, setBorrowerName] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (!alive) return;
        if (res && res.value) {
          const data = JSON.parse(res.value);
          setTools(data.tools || []);
          setLoans(data.loans || []);
        }
      } catch (e) {
        // chave ainda nao existe, comeca vazio
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function persist(nextTools, nextLoans) {
    setSaving(true);
    setError("");
    try {
      const result = await window.storage.set(
        STORAGE_KEY,
        JSON.stringify({ tools: nextTools, loans: nextLoans }),
        true
      );
      if (!result) throw new Error("sem resultado");
    } catch (e) {
      setError("Nao foi possivel salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function addTool() {
    const name = newTool.name.trim();
    if (!name) { setError("Digite o nome da ferramenta."); return; }
    const tool = {
      id: uid(),
      name,
      code: newTool.code.trim(),
      value: newTool.value ? Number(newTool.value) : null,
      photos: newTool.photos,
    };
    const next = [...tools, tool];
    setTools(next);
    setNewTool({ name: "", code: "", value: "", photos: [] });
    setShowAddTool(false);
    setError("");
    persist(next, loans);
  }

  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const remaining = MAX_PHOTOS - newTool.photos.length;
    if (remaining <= 0) {
      setError(`Maximo de ${MAX_PHOTOS} fotos por ferramenta.`);
      return;
    }
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(`Maximo de ${MAX_PHOTOS} fotos por ferramenta. Algumas imagens nao foram adicionadas.`);
    } else {
      setError("");
    }
    setPhotoLoading(true);
    try {
      const dataUrls = [];
      for (const file of toAdd) {
        if (file.size > MAX_PHOTO_BYTES) {
          setError(`A imagem "${file.name}" e muito grande. Use fotos menores.`);
          continue;
        }
        const url = await fileToDataUrl(file);
        dataUrls.push(url);
      }
      setNewTool((prev) => ({ ...prev, photos: [...prev.photos, ...dataUrls].slice(0, MAX_PHOTOS) }));
    } catch (e) {
      setError("Nao foi possivel carregar uma das imagens.");
    } finally {
      setPhotoLoading(false);
    }
  }

  function removeNewPhoto(index) {
    setNewTool((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  }

  function removeTool(toolId) {
    const next = tools.filter((t) => t.id !== toolId);
    setTools(next);
    persist(next, loans);
  }

  function openLoanModal(tool) {
    setLoanModal(tool);
    setBorrowerName("");
    setError("");
  }

  function confirmLoan() {
    const name = borrowerName.trim();
    if (!name) { setError("Digite o nome de quem vai levar a ferramenta."); return; }
    const loan = {
      id: uid(),
      toolId: loanModal.id,
      borrower: name,
      loanDate: new Date().toISOString().slice(0, 10),
      returnDate: null,
    };
    const next = [...loans, loan];
    setLoans(next);
    setLoanModal(null);
    setError("");
    persist(tools, next);
  }

  function returnTool(loanId) {
    const next = loans.map((l) =>
      l.id === loanId ? { ...l, returnDate: new Date().toISOString().slice(0, 10) } : l
    );
    setLoans(next);
    persist(tools, next);
  }

  const activeLoanByTool = useMemo(() => {
    const map = {};
    for (const l of loans) {
      if (!l.returnDate) map[l.toolId] = l;
    }
    return map;
  }, [loans]);

  const rows = useMemo(() => {
    return tools
      .map((t) => ({ tool: t, loan: activeLoanByTool[t.id] || null }))
      .filter(({ tool }) => {
        const q = search.trim().toLowerCase();
        if (q && !tool.name.toLowerCase().includes(q) && !tool.code.toLowerCase().includes(q)) return false;
        return true;
      })
      .filter(({ loan }) => {
        if (filter === "disponiveis") return !loan;
        if (filter === "emprestadas") return !!loan;
        return true;
      })
      .sort((a, b) => a.tool.name.localeCompare(b.tool.name, "pt-BR"));
  }, [tools, activeLoanByTool, search, filter]);

  const totalEmprestadas = Object.keys(activeLoanByTool).length;

  if (!loaded) {
    return (
      <div style={styles.page}>
        <p style={styles.loadingText}>Carregando ferramentas...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        button { cursor: pointer; font-family: 'Inter', sans-serif; }
        input { font-family: 'Inter', sans-serif; }
      `}</style>

      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>CONTROLE DE FERRAMENTAS</div>
          <h1 style={styles.title}>Ferramentaria</h1>
        </div>
        <div style={styles.headerStats}>
          <div style={styles.statBlock}>
            <div style={styles.statNumber}>{tools.length}</div>
            <div style={styles.statLabel}>cadastradas</div>
          </div>
          <div style={{ ...styles.statBlock, borderColor: totalEmprestadas > 0 ? COLORS.rust : COLORS.steel }}>
            <div style={{ ...styles.statNumber, color: totalEmprestadas > 0 ? COLORS.rust : COLORS.ink }}>
              {totalEmprestadas}
            </div>
            <div style={styles.statLabel}>emprestadas</div>
          </div>
        </div>
      </header>

      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="Buscar por nome ou codigo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <div style={styles.filterGroup}>
          {[
            ["todas", "Todas"],
            ["disponiveis", "Disponiveis"],
            ["emprestadas", "Emprestadas"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={filter === key ? styles.filterBtnActive : styles.filterBtn}
            >
              {label}
            </button>
          ))}
        </div>
        <button style={styles.addBtn} onClick={() => { setShowAddTool(true); setError(""); }}>
          + Nova ferramenta
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}
      {saving && <div style={styles.savingBanner}>Salvando...</div>}

      {showAddTool && (
        <div style={styles.inlineCard}>
          <div style={styles.inlineCardTitle}>Cadastrar ferramenta</div>
          <div style={styles.inlineCardRow}>
            <input
              type="text"
              placeholder="Nome da ferramenta (ex: Furadeira Bosch)"
              value={newTool.name}
              onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
              style={styles.textInput}
            />
            <input
              type="text"
              placeholder="Codigo / etiqueta (opcional)"
              value={newTool.code}
              onChange={(e) => setNewTool({ ...newTool, code: e.target.value })}
              style={{ ...styles.textInput, maxWidth: 180 }}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Valor (R$)"
              value={newTool.value}
              onChange={(e) => setNewTool({ ...newTool, value: e.target.value })}
              style={{ ...styles.textInput, maxWidth: 140 }}
            />
          </div>

          <div style={styles.photoSection}>
            <label style={styles.modalLabel}>Fotos (ate {MAX_PHOTOS})</label>
            <div style={styles.photoRow}>
              {newTool.photos.map((src, i) => (
                <div key={i} style={styles.photoThumbWrap}>
                  <img src={src} alt={`Foto ${i + 1}`} style={styles.photoThumb} />
                  <button
                    type="button"
                    style={styles.photoRemoveBtn}
                    onClick={() => removeNewPhoto(i)}
                    aria-label="Remover foto"
                  >
                    x
                  </button>
                </div>
              ))}
              {newTool.photos.length < MAX_PHOTOS && (
                <label style={styles.photoAddBtn}>
                  {photoLoading ? "..." : "+ foto"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>
          </div>

          <div style={styles.inlineCardActions}>
            <button style={styles.ghostBtn} onClick={() => { setShowAddTool(false); setNewTool({ name: "", code: "", value: "", photos: [] }); setError(""); }}>Cancelar</button>
            <button style={styles.primaryBtn} onClick={addTool}>Salvar</button>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div style={styles.emptyState}>
          {tools.length === 0
            ? "Nenhuma ferramenta cadastrada ainda. Clique em \"Nova ferramenta\" para comecar."
            : "Nenhuma ferramenta encontrada com esse filtro."}
        </div>
      )}

      <div style={styles.list}>
        {rows.map(({ tool, loan }) => (
          <div key={tool.id} style={styles.tagCard}>
            <div style={styles.punchHole} />
            {tool.photos && tool.photos.length > 0 ? (
              <img
                src={tool.photos[0]}
                alt={tool.name}
                style={styles.cardThumb}
                onClick={() => setPreview(tool)}
              />
            ) : (
              <div style={styles.cardThumbPlaceholder} />
            )}
            <div style={styles.tagBody}>
              <div style={styles.tagMain}>
                <div style={styles.tagName}>{tool.name}</div>
                <div style={styles.tagMetaRow}>
                  {tool.code && <span style={styles.tagCode}>#{tool.code}</span>}
                  {tool.value != null && <span style={styles.tagValue}>{formatMoney(tool.value)}</span>}
                </div>
              </div>
              <div style={styles.tagStatus}>
                {loan ? (
                  <div style={styles.statusLoaned}>
                    <div style={styles.statusLoanedTitle}>com {loan.borrower}</div>
                    <div style={styles.statusLoanedSub}>
                      desde {formatDate(loan.loanDate)} - {diasEmprestada(loan.loanDate)} dia(s)
                    </div>
                  </div>
                ) : (
                  <div style={styles.statusAvailable}>Disponivel</div>
                )}
              </div>
            </div>
            <div style={styles.tagActions}>
              {loan ? (
                <button style={styles.returnBtn} onClick={() => returnTool(loan.id)}>
                  Registrar devolucao
                </button>
              ) : (
                <button style={styles.loanBtn} onClick={() => openLoanModal(tool)}>
                  Registrar emprestimo
                </button>
              )}
              <button style={styles.removeBtn} onClick={() => removeTool(tool.id)} aria-label="Remover ferramenta">
                remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div style={styles.modalOverlay} onClick={() => setPreview(null)}>
          <div style={styles.previewModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>{preview.name}</div>
            <div style={styles.previewPhotos}>
              {preview.photos.map((src, i) => (
                <img key={i} src={src} alt={`Foto ${i + 1}`} style={styles.previewPhoto} />
              ))}
            </div>
            <div style={styles.inlineCardActions}>
              <button style={styles.ghostBtn} onClick={() => setPreview(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {loanModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalTitle}>Emprestar "{loanModal.name}"</div>
            <label style={styles.modalLabel}>Quem esta levando?</label>
            <input
              type="text"
              autoFocus
              placeholder="Nome do colega"
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
              style={styles.textInput}
              onKeyDown={(e) => { if (e.key === "Enter") confirmLoan(); }}
            />
            {error && <div style={styles.modalError}>{error}</div>}
            <div style={styles.inlineCardActions}>
              <button style={styles.ghostBtn} onClick={() => { setLoanModal(null); setError(""); }}>Cancelar</button>
              <button style={styles.primaryBtn} onClick={confirmLoan}>Confirmar emprestimo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

const styles = {
  page: {
    fontFamily: "'Inter', sans-serif",
    background: COLORS.bg,
    color: COLORS.ink,
    minHeight: "100vh",
    padding: "0",
    width: "100%",
  },
  loadingText: {
    padding: "2rem",
    color: COLORS.muted,
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: "1.75rem 1.5rem 1.25rem",
    borderBottom: `3px solid ${COLORS.ink}`,
  },
  eyebrow: {
    fontFamily: "'Oswald', sans-serif",
    fontSize: 12,
    letterSpacing: "0.14em",
    color: COLORS.steel,
    fontWeight: 600,
    marginBottom: 4,
  },
  title: {
    fontFamily: "'Oswald', sans-serif",
    fontSize: 34,
    fontWeight: 700,
    margin: 0,
    letterSpacing: "0.01em",
  },
  headerStats: {
    display: "flex",
    gap: 12,
  },
  statBlock: {
    border: `2px solid ${COLORS.steel}`,
    borderRadius: 4,
    padding: "6px 16px",
    textAlign: "center",
    minWidth: 84,
  },
  statNumber: {
    fontFamily: "'Oswald', sans-serif",
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  toolbar: {
    display: "flex",
    gap: 10,
    padding: "1.25rem 1.5rem 0.5rem",
    flexWrap: "wrap",
    alignItems: "center",
  },
  searchInput: {
    flex: "1 1 220px",
    padding: "10px 12px",
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 4,
    fontSize: 14,
    background: COLORS.cardBg,
    outline: "none",
  },
  filterGroup: {
    display: "flex",
    gap: 4,
    background: "#EAE6D9",
    padding: 3,
    borderRadius: 4,
  },
  filterBtn: {
    padding: "7px 12px",
    fontSize: 13,
    border: "none",
    background: "transparent",
    color: COLORS.muted,
    borderRadius: 3,
    fontWeight: 500,
  },
  filterBtnActive: {
    padding: "7px 12px",
    fontSize: 13,
    border: "none",
    background: COLORS.ink,
    color: "#FFF",
    borderRadius: 3,
    fontWeight: 500,
  },
  addBtn: {
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 4,
    background: COLORS.yellow,
    color: COLORS.ink,
  },
  errorBanner: {
    margin: "0.75rem 1.5rem 0",
    padding: "10px 14px",
    background: "#FBE4DA",
    color: COLORS.rust,
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 500,
  },
  savingBanner: {
    margin: "0.75rem 1.5rem 0",
    fontSize: 12,
    color: COLORS.muted,
  },
  inlineCard: {
    margin: "1rem 1.5rem 0",
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: "1rem",
  },
  inlineCardTitle: {
    fontFamily: "'Oswald', sans-serif",
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 10,
  },
  inlineCardRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  textInput: {
    flex: "1 1 200px",
    padding: "10px 12px",
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 4,
    fontSize: 14,
    outline: "none",
  },
  inlineCardActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  ghostBtn: {
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 4,
    background: "transparent",
    color: COLORS.ink,
  },
  primaryBtn: {
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderRadius: 4,
    background: COLORS.steel,
    color: "#FFF",
  },
  emptyState: {
    margin: "2rem 1.5rem",
    textAlign: "center",
    color: COLORS.muted,
    fontSize: 14,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "1rem 1.5rem 2rem",
  },
  tagCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderLeft: `6px solid ${COLORS.steel}`,
    borderRadius: 4,
    padding: "12px 16px",
  },
  punchHole: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: COLORS.bg,
    border: `1.5px solid ${COLORS.border}`,
    flexShrink: 0,
  },
  tagBody: {
    display: "flex",
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  tagMain: {
    minWidth: 160,
  },
  tagName: {
    fontFamily: "'Oswald', sans-serif",
    fontSize: 17,
    fontWeight: 600,
  },
  tagMetaRow: {
    display: "flex",
    gap: 10,
    marginTop: 2,
  },
  tagCode: {
    fontSize: 12,
    color: COLORS.muted,
  },
  tagValue: {
    fontSize: 12,
    color: COLORS.steel,
    fontWeight: 600,
  },
  cardThumb: {
    width: 48,
    height: 48,
    objectFit: "cover",
    borderRadius: 4,
    border: `1.5px solid ${COLORS.border}`,
    flexShrink: 0,
    cursor: "pointer",
  },
  cardThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 4,
    border: `1.5px dashed ${COLORS.border}`,
    flexShrink: 0,
    background: COLORS.bg,
  },
  photoSection: {
    marginTop: 12,
  },
  photoRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  photoThumbWrap: {
    position: "relative",
    width: 64,
    height: 64,
  },
  photoThumb: {
    width: 64,
    height: 64,
    objectFit: "cover",
    borderRadius: 4,
    border: `1.5px solid ${COLORS.border}`,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: `1.5px solid ${COLORS.border}`,
    background: COLORS.cardBg,
    color: COLORS.rust,
    fontSize: 11,
    lineHeight: 1,
    padding: 0,
  },
  photoAddBtn: {
    width: 64,
    height: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1.5px dashed ${COLORS.border}`,
    borderRadius: 4,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
    cursor: "pointer",
  },
  previewModal: {
    background: COLORS.cardBg,
    borderRadius: 6,
    padding: "1.5rem",
    width: "100%",
    maxWidth: 480,
  },
  previewPhotos: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  previewPhoto: {
    width: 130,
    height: 130,
    objectFit: "cover",
    borderRadius: 4,
    border: `1.5px solid ${COLORS.border}`,
  },
  tagStatus: {
    minWidth: 160,
  },
  statusAvailable: {
    fontSize: 13,
    fontWeight: 600,
    color: "#2E7D4F",
  },
  statusLoaned: {},
  statusLoanedTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.rust,
  },
  statusLoanedSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  tagActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  loanBtn: {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderRadius: 4,
    background: COLORS.ink,
    color: "#FFF",
  },
  returnBtn: {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    border: `1.5px solid ${COLORS.steel}`,
    borderRadius: 4,
    background: "transparent",
    color: COLORS.steel,
  },
  removeBtn: {
    padding: "6px 8px",
    fontSize: 12,
    border: "none",
    background: "transparent",
    color: COLORS.muted,
    textDecoration: "underline",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(51,50,45,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 10,
  },
  modal: {
    background: COLORS.cardBg,
    borderRadius: 6,
    padding: "1.5rem",
    width: "100%",
    maxWidth: 380,
  },
  modalTitle: {
    fontFamily: "'Oswald', sans-serif",
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 12,
  },
  modalLabel: {
    display: "block",
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 6,
    fontWeight: 500,
  },
  modalError: {
    fontSize: 12,
    color: COLORS.rust,
    marginTop: 8,
  },
};
