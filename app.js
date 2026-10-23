/* =========================================================
   ĐỌC DỄ — HIGH-COMFORT E-READER ENGINE
   Giao diện 2 cột: Tiến độ %, Thống kê và Chức năng nằm bên tay trái.
   Khung đọc bên tay phải với bôi vàng tuần tự theo phím mũi tên.
   ========================================================= */

let getDocument;
let TextLayer;
let pdfJsPromise;
let pdfViewerStylesPromise;

function loadPdfViewerStyles() {
  if (pdfViewerStylesPromise) return pdfViewerStylesPromise;

  pdfViewerStylesPromise = new Promise((resolve) => {
    const existing = document.querySelector('link[data-pdf-viewer-styles]');
    if (existing) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/web/pdf_viewer.css';
    link.dataset.pdfViewerStyles = 'true';
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });

  return pdfViewerStylesPromise;
}

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.mjs'),
      loadPdfViewerStyles()
    ]).then(([pdfjs]) => {
        getDocument = pdfjs.getDocument;
        TextLayer = pdfjs.TextLayer;
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.mjs';
        return pdfjs;
      });
  }

  return pdfJsPromise;
}

const SETTINGS_KEY = 'docde-settings-v2';
const RECENT_KEY = 'docde-recent-books-v2';
const PROGRESS_KEY = 'docde-progress-v2';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const PAGE_CACHE_RADIUS = 2;

const $ = (id) => document.getElementById(id);

// Application State
const state = {
  pdf: null,
  fileName: '',
  fileSize: 0,
  totalPages: 1,
  currentPage: 1,
  currentWordIndex: 0,
  currentWords: [],
  pageCache: new Map(), // pageNo -> { textContent, words, paragraphs, isScanned, viewport }
  pageLoadPromises: new Map(),
  mode: 'text', // 'text' | 'pdf'
  pdfZoom: 1.0,
  isProcessing: false,
  isScannedDoc: false,
  keyHoldTimer: null,
  keyHoldInterval: null,
  isRendering: false,
  activeWordElement: null,
  tts: {
    synth: window.speechSynthesis || null,
    speaking: false,
    paused: false,
    rate: 1.0,
    voice: null
  },
  settings: {
    theme: 'paper',
    font: 'merriweather',
    fontSize: 19,
    lineHeight: 1.85,
    width: '820px',
    uniformFont: true,
    autoOcr: true
  }
};

// Elements Cache
const els = {
  // Topbar
  homeLogoButton: $('homeLogoButton'),
  readerDocPill: $('readerDocPill'),
  docTitle: $('docTitle'),
  docSize: $('docSize'),
  docStatusText: $('docStatusText'),
  readerActions: $('readerActions'),
  workspaceActions: $('workspaceActions'),
  fullscreenBtn: $('fullscreenBtn'),
  backToHomeBtn: $('backToHomeBtn'),

  // Left Sidebar: Progress %, Stats & Functions
  readerSidebar: $('readerSidebar'),
  progressRing: $('progressRing'),
  progressPercent: $('progressPercent'),
  progressBar: $('progressBar'),
  pageNumberInput: $('pageNumberInput'),
  pageNumber: $('pageNumber'),
  wordNumber: $('wordNumber'),
  modeTextBtn: $('modeTextBtn'),
  modePdfBtn: $('modePdfBtn'),
  ttsToggleBtn: $('ttsToggleBtn'),
  ocrTriggerBtn: $('ocrTriggerBtn'),
  fontDecBtn: $('fontDecBtn'),
  fontIncBtn: $('fontIncBtn'),
  fontSizeVal: $('fontSizeVal'),
  uniformFontToggle: $('uniformFontToggle'),
  editPageBtn: $('editPageBtn'),
  appearanceBtn: $('appearanceBtn'),
  changeFileBtn: $('changeFileBtn'),

  // Right Toolbar
  prevPageBtn: $('prevPageBtn'),
  nextPageBtn: $('nextPageBtn'),
  pageLabel: $('pageLabel'),
  progressScrubber: $('progressScrubber'),
  scrubberTooltip: $('scrubberTooltip'),
  toolbarFontDecBtn: $('toolbarFontDecBtn'),
  toolbarFontSizeVal: $('toolbarFontSizeVal'),
  toolbarFontIncBtn: $('toolbarFontIncBtn'),
  toolbarOcrBtn: $('toolbarOcrBtn'),
  pdfZoomGroup: $('pdfZoomGroup'),
  zoomOutBtn: $('zoomOutBtn'),
  zoomInBtn: $('zoomInBtn'),
  zoomFitBtn: $('zoomFitBtn'),
  zoomValueLabel: $('zoomValueLabel'),

  // OCR
  ocrBanner: $('ocrBanner'),
  runOcrBtn: $('runOcrBtn'),
  closeOcrBannerBtn: $('closeOcrBannerBtn'),
  ocrProgressWrap: $('ocrProgressWrap'),
  ocrProgressText: $('ocrProgressText'),
  ocrProgressFill: $('ocrProgressFill'),

  // Views & Dropzone
  workspaceView: $('workspaceView'),
  readerView: $('readerView'),
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  chooseFileBtn: $('chooseFileBtn'),
  openDefaultBookBtn: $('openDefaultBookBtn'),
  recentSection: $('recentSection'),
  recentCount: $('recentCount'),
  recentList: $('recentList'),

  // Reading Surface
  readerViewport: $('readerViewport'),
  readerSurface: $('readerSurface'),
  readerLoading: $('readerLoading'),
  loadingMsg: $('loadingMsg'),
  edgePrevBtn: $('edgePrevBtn'),
  edgeNextBtn: $('edgeNextBtn'),
  textSheet: $('textSheet'),
  sheetBookTitle: $('sheetBookTitle'),
  sheetChapterTitle: $('sheetChapterTitle'),
  sheetWordCounter: $('sheetWordCounter'),
  sheetBody: $('sheetBody'),
  sheetPageNum: $('sheetPageNum'),
  sheetDocProgress: $('sheetDocProgress'),
  pdfCanvasContainer: $('pdfCanvasContainer'),
  pdfCanvasWrap: $('pdfCanvasWrap'),
  pdfCanvas: $('pdfCanvas'),
  pdfWordHighlight: $('pdfWordHighlight'),
  pdfTextLayer: $('pdfTextLayer'),

  // Bottom Dock
  dockPrevBtn: $('dockPrevBtn'),
  dockNextBtn: $('dockNextBtn'),
  dockPageInfo: $('dockPageInfo'),
  dockChangeFileBtn: $('dockChangeFileBtn'),

  // Modals
  processingModal: $('processingModal'),
  procTitle: $('procTitle'),
  procFileName: $('procFileName'),
  procBarFill: $('procBarFill'),
  procStatusMsg: $('procStatusMsg'),
  stepUpload: $('stepUpload'),
  stepParse: $('stepParse'),
  stepText: $('stepText'),
  stepHighlight: $('stepHighlight'),
  stepDone: $('stepDone'),

  // Error Modal
  errorModal: $('errorModal'),
  errorTitle: $('errorTitle'),
  errorSubtitle: $('errorSubtitle'),
  errorReasonText: $('errorReasonText'),
  errorSolutionList: $('errorSolutionList'),
  errorRetryBtn: $('errorRetryBtn'),
  errorCloseBtn: $('errorCloseBtn'),

  // Edit Page Text Modal
  editPageModal: $('editPageModal'),
  editPageModalTitle: $('editPageModalTitle'),
  editPageCloseBtn: $('editPageCloseBtn'),
  editPageTextarea: $('editPageTextarea'),
  editModalOcrBtn: $('editModalOcrBtn'),
  editModalResetBtn: $('editModalResetBtn'),
  editModalCancelBtn: $('editModalCancelBtn'),
  editModalSaveBtn: $('editModalSaveBtn'),

  // Full Appearance Popover
  appearancePopover: $('appearancePopover'),
  appearanceCloseBtn: $('appearanceCloseBtn'),
  fontSizeSlider: $('fontSizeSlider'),
  fontSizeValPopover: $('fontSizeValPopover'),

  // TTS Bar
  ttsBar: $('ttsBar'),
  ttsStatusText: $('ttsStatusText'),
  ttsPlayPauseBtn: $('ttsPlayPauseBtn'),
  ttsPlayIcon: $('ttsPlayIcon'),
  ttsStopBtn: $('ttsStopBtn'),
  ttsRateSelect: $('ttsRateSelect'),
  ttsCloseBtn: $('ttsCloseBtn'),

  appToast: $('appToast')
};

/* =========================================================
   1. APP INITIALIZATION & SETTINGS
   ========================================================= */
function init() {
  loadSettings();
  applySettings();
  renderRecentList();
  setupEventListeners();
  setupTTSVoice();

  const saved = getProgress();
  if (saved && saved.fileName) {
    els.docTitle.textContent = saved.fileName;
  }
}

function showToast(message, duration = 3200) {
  els.appToast.textContent = message;
  els.appToast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.appToast.classList.remove('visible');
  }, duration);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      state.settings = { ...state.settings, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

function applySettings() {
  document.body.setAttribute('data-theme', state.settings.theme);
  document.body.setAttribute('data-font', state.settings.font);

  document.documentElement.style.setProperty(
    '--reader-font-size',
    `${state.settings.fontSize}px`
  );
  document.documentElement.style.setProperty(
    '--reader-line-height',
    state.settings.lineHeight
  );
  document.documentElement.style.setProperty(
    '--reader-max-width',
    state.settings.width
  );

  if (els.fontSizeVal) els.fontSizeVal.textContent = `${state.settings.fontSize} px`;
  if (els.toolbarFontSizeVal) els.toolbarFontSizeVal.textContent = `${state.settings.fontSize} px`;
  if (els.fontSizeValPopover) els.fontSizeValPopover.textContent = `${state.settings.fontSize} px`;
  if (els.fontSizeSlider) els.fontSizeSlider.value = state.settings.fontSize;

  // Preset buttons sync
  document.querySelectorAll('.font-preset-btn').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.preset, 10) === state.settings.fontSize);
  });

  // Uniform font size toggle & sheet class
  if (els.uniformFontToggle) {
    els.uniformFontToggle.checked = Boolean(state.settings.uniformFont);
  }
  if (els.textSheet) {
    els.textSheet.classList.toggle('uniform-reading-font', Boolean(state.settings.uniformFont));
  }

  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.setTheme === state.settings.theme);
  });
  document.querySelectorAll('[data-set-font]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.setFont === state.settings.font);
  });
  document.querySelectorAll('[data-set-line-height]').forEach((btn) => {
    btn.classList.toggle(
      'active',
      parseFloat(btn.dataset.setLineHeight) === state.settings.lineHeight
    );
  });
  document.querySelectorAll('[data-set-width]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.setWidth === state.settings.width);
  });
}

function changeFontSize(val, isDelta = false) {
  if (isDelta) {
    state.settings.fontSize = Math.min(32, Math.max(14, state.settings.fontSize + val));
  } else {
    state.settings.fontSize = Math.min(32, Math.max(14, val));
  }
  applySettings();
  saveSettings();
}

/* =========================================================
   2. FILE VALIDATION & PROCESSING PIPELINE
   ========================================================= */
function validateFile(file) {
  if (!file) {
    return {
      valid: false,
      title: 'Không tìm thấy file',
      reason: 'Trình duyệt không nhận được tệp dữ liệu được chọn.',
      solutions: ['Vui lòng nhấp nút "Tải PDF lên" và chọn một file PDF từ máy tính của bạn.']
    };
  }

  const isPdfType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdfType) {
    return {
      valid: false,
      title: 'Định dạng file không hợp lệ',
      reason: `File "${file.name}" không phải định dạng PDF. Hệ thống chỉ xử lý tệp có đuôi .pdf.`,
      solutions: [
        'Vui lòng chọn tài liệu có đuôi .pdf hoặc chuyển đổi tài liệu sang PDF trước khi tải lên.',
        'Đảm bảo tệp không bị đổi đuôi mở rộng sai lệch.'
      ]
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      title: 'File PDF rỗng (0 bytes)',
      reason: `Tệp "${file.name}" có dung lượng 0 bytes, không chứa dữ liệu cấu trúc PDF.`,
      solutions: [
        'Kiểm tra lại tài liệu gốc trên máy tính của bạn.',
        'Xuất lại hoặc tải lại tệp từ nguồn ban đầu để đảm bảo file nguyên vẹn.'
      ]
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      title: 'Dung lượng file vượt quá giới hạn',
      reason: `File có dung lượng ${formatBytes(file.size)}, vượt quá hạn mức cho phép là 100 MB.`,
      solutions: [
        'Sử dụng công cụ nén PDF (như iLovePDF, Smallpdf) để giảm kích thước tệp.',
        'Chia nhỏ tài liệu nếu là sách dung lượng lớn chứa nhiều hình ảnh scan.'
      ]
    };
  }

  return { valid: true };
}

function showProcessingStatus(step, percent, msg) {
  els.processingModal.hidden = false;
  els.procBarFill.style.width = `${percent}%`;
  els.procStatusMsg.textContent = msg;

  const steps = [
    { el: els.stepUpload, name: 'upload' },
    { el: els.stepParse, name: 'parse' },
    { el: els.stepText, name: 'text' },
    { el: els.stepHighlight, name: 'highlight' },
    { el: els.stepDone, name: 'done' }
  ];

  let passed = true;
  steps.forEach((s) => {
    s.el.classList.remove('active', 'done');
    const checkSpan = s.el.querySelector('.step-check');
    if (s.name === step) {
      s.el.classList.add('active');
      checkSpan.textContent = '▶';
      passed = false;
    } else if (passed) {
      s.el.classList.add('done');
      checkSpan.textContent = '✓';
    } else {
      checkSpan.textContent = '○';
    }
  });

  if (step === 'done') {
    steps.forEach((s) => {
      s.el.classList.add('done');
      s.el.querySelector('.step-check').textContent = '✓';
    });
  }
}

function hideProcessingStatus() {
  els.processingModal.hidden = true;
}

function showErrorModal(title, subtitle, reason, solutions) {
  hideProcessingStatus();
  els.errorTitle.textContent = title;
  els.errorSubtitle.textContent = subtitle;
  els.errorReasonText.textContent = reason;
  els.errorSolutionList.innerHTML = solutions.map((s) => `<li>${s}</li>`).join('');
  els.errorModal.hidden = false;
}

function hideErrorModal() {
  els.errorModal.hidden = true;
}

/* =========================================================
   3. AUTOMATIC PDF PROCESSING & EXTRACTION
   ========================================================= */
async function processPdfFile(fileOrUrl, originalFileName = '', originalSize = 0) {
  let fileName = originalFileName;
  let fileSize = originalSize;
  let fileData = null;

  if (fileOrUrl instanceof File) {
    fileName = fileOrUrl.name;
    fileSize = fileOrUrl.size;
    const check = validateFile(fileOrUrl);
    if (!check.valid) {
      showErrorModal(check.title, 'Không thể xử lý tệp vừa chọn.', check.reason, check.solutions);
      return;
    }
  }

  els.procTitle.textContent = 'Đang xử lý tài liệu PDF';
  els.procFileName.textContent = `${fileName} • ${formatBytes(fileSize)}`;
  showProcessingStatus('upload', 20, 'Đang đọc dữ liệu file vào bộ nhớ…');

  try {
    await loadPdfJs();

    if (fileOrUrl instanceof File) {
      const buffer = await fileOrUrl.arrayBuffer();
      fileData = new Uint8Array(buffer);
    } else if (typeof fileOrUrl === 'string') {
      const res = await fetch(fileOrUrl);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const buffer = await res.arrayBuffer();
      fileData = new Uint8Array(buffer);
      if (!fileSize) fileSize = fileData.byteLength;
    }

    showProcessingStatus('parse', 45, 'Đang phân tích cấu trúc trang PDF…');
    const loadingTask = getDocument({ data: fileData });
    const pdf = await loadingTask.promise;

    state.pdf = pdf;
    state.fileName = fileName;
    state.fileSize = fileSize;
    state.totalPages = pdf.numPages;
    state.pageCache.clear();
    state.pageLoadPromises.clear();
    state.currentWordIndex = 0;

    showProcessingStatus('text', 70, 'Đang trích xuất lớp văn bản và kiểm tra OCR…');
    // Sample pages 1-3 so image covers don't falsely classify digital books as scanned
    const checkPages = [1];
    if (pdf.numPages >= 2) checkPages.push(2);
    if (pdf.numPages >= 3) checkPages.push(3);

    let hasDigitalText = false;
    for (const p of checkPages) {
      const pData = await getPageData(p);
      if (!pData.isScanned && pData.words.length > 5) {
        hasDigitalText = true;
        break;
      }
    }
    state.isScannedDoc = !hasDigitalText;

    showProcessingStatus('highlight', 90, 'Đang chuẩn bị dữ liệu highlight từng từ…');
    showProcessingStatus('done', 100, 'Hoàn tất! Đang chuyển sang màn hình đọc…');

    const saved = getProgress();
    if (saved && saved.fileName === fileName && saved.page <= pdf.numPages) {
      state.currentPage = saved.page;
      state.currentWordIndex = saved.wordIndex || 0;
    } else {
      state.currentPage = 1;
      state.currentWordIndex = 0;
    }

    setTimeout(async () => {
      hideProcessingStatus();
      openReaderUi();
      await renderCurrentPage();
      showToast(`Tài liệu đã sẵn sàng (${pdf.numPages} trang). Dùng phím mũi tên để đọc.`);
    }, 350);

    saveRecentBook({
      name: fileName,
      pages: pdf.numPages,
      size: formatBytes(fileSize),
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('PDF Processing Error:', err);
    let title = 'Lỗi phân tích tài liệu PDF';
    let reason = err.message || 'PDF.js không đọc được cấu trúc file.';
    let solutions = [
      'Đảm bảo tệp không có mật khẩu bảo vệ.',
      'Thử mở lại tệp bằng phần mềm khác hoặc xuất lại file PDF.',
      'Chọn một file PDF khác để tiếp tục.'
    ];

    if (err.name === 'PasswordException') {
      title = 'File PDF có mật khẩu bảo vệ';
      reason = 'Tệp PDF yêu cầu mật khẩu để mở nội dung.';
      solutions = ['Vui lòng mở khóa mật khẩu file PDF trước khi tải lên.'];
    } else if (err.name === 'InvalidPDFException') {
      title = 'Cấu trúc PDF bị hỏng';
      reason = 'File bị thiếu hoặc hỏng phần đầu/cuối của chuẩn PDF (EOF marker).';
      solutions = ['Tải lại file từ nguồn gốc hoặc dùng công cụ sửa lỗi PDF trực tuyến.'];
    }

    showErrorModal(title, 'Không thể tiếp tục xử lý tệp.', reason, solutions);
  }
}

function openReaderUi() {
  els.workspaceView.hidden = true;
  els.readerView.hidden = false;
  els.readerDocPill.hidden = false;
  els.docTitle.textContent = state.fileName;
  els.docTitle.title = state.fileName;
  els.docSize.textContent = `• ${formatBytes(state.fileSize)}`;
  els.readerActions.hidden = false;
  els.workspaceActions.hidden = true;

  if (els.pageNumber) els.pageNumber.textContent = state.totalPages;
  if (els.pageLabel) els.pageLabel.textContent = `Trang ${state.currentPage} / ${state.totalPages}`;
  els.pageNumberInput.max = state.totalPages;
  els.progressScrubber.max = state.totalPages;

  els.ocrBanner.hidden = true;
  if (els.toolbarOcrBtn) {
    els.toolbarOcrBtn.hidden = false;
  }
}

/* =========================================================
   4. PAGE EXTRACTION & WORD COORDINATES
   ========================================================= */
async function getPageData(pageNo) {
  if (state.pageCache.has(pageNo)) {
    return state.pageCache.get(pageNo);
  }

  if (state.pageLoadPromises.has(pageNo)) {
    return state.pageLoadPromises.get(pageNo);
  }

  const loadPromise = (async () => {
    const page = await state.pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const extracted = extractWordsAndParagraphs(textContent, viewport, pageNo);

    const data = {
      page,
      viewport,
      textContent,
      words: extracted.words,
      paragraphs: extracted.paragraphs,
      rawText: extracted.rawText,
      isScanned: extracted.words.length === 0
    };

    state.pageCache.set(pageNo, data);
    return data;
  })();

  state.pageLoadPromises.set(pageNo, loadPromise);
  try {
    return await loadPromise;
  } finally {
    state.pageLoadPromises.delete(pageNo);
  }
}

function isNoiseMarginItem(item, viewportHeight) {
  const y = item.transform[5];
  const pageH = viewportHeight || 792;
  // Extreme footer margin (bottom ~9% of page or y <= 68 on 792pt page)
  if (y <= Math.max(68, pageH * 0.088)) {
    const s = item.str.trim();
    if (!s) return true;
    // Corrupted isolated diacritics, ornaments, corrupted glyphs, standalone page numbers or punctuation
    if (
      s.length <= 4 &&
      (/^[ẫắằẳỗễẵỡáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵâăêôơưđ\W]$/i.test(s) ||
        /^\d+$/.test(s) ||
        !/[a-zA-Z0-9\u00C0-\u1EF9]/.test(s))
    ) {
      return true;
    }
  }
  // Extreme header margin (top ~5% of page)
  if (y >= pageH * 0.95) {
    const s = item.str.trim();
    if (!s || (s.length <= 3 && !/[a-zA-Z0-9\u00C0-\u1EF9]/.test(s))) {
      return true;
    }
  }
  return false;
}

function extractWordsAndParagraphs(textContent, viewport, pageNo) {
  const pageH = viewport?.height || 792;
  const rawItems = (textContent?.items || []).filter(
    (item) => typeof item.str === 'string' && item.str.trim()
  );

  // Clean out margin noise (e.g. corrupted footer dingbats like ẫ, ắ)
  const items = rawItems.filter((it) => !isNoiseMarginItem(it, pageH));

  if (!items.length) {
    return { words: [], paragraphs: [], rawText: '', isScanned: true };
  }

  const sorted = [...items].sort((a, b) => {
    const yA = a.transform[5];
    const yB = b.transform[5];
    if (Math.abs(yA - yB) > 4) {
      return yB - yA;
    }
    return a.transform[4] - b.transform[4];
  });

  // Calculate dominant/median baseFontSize on the page
  const fontSizes = sorted.map((it) => Math.hypot(it.transform[0], it.transform[1]) || 12);
  fontSizes.sort((a, b) => a - b);
  const baseFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 14;

  const words = [];
  let pageWordIndex = 0;

  const lines = [];
  let curLine = [];
  let curY = null;
  let curFontSize = 12;

  for (const item of sorted) {
    const y = item.transform[5];
    const fontSize = Math.hypot(item.transform[0], item.transform[1]) || 12;

    if (curY === null || Math.abs(y - curY) > Math.min(curFontSize * 0.45, 6)) {
      if (curLine.length) {
        lines.push({ y: curY, fontSize: curFontSize, items: curLine });
      }
      curLine = [item];
      curY = y;
      curFontSize = fontSize;
    } else {
      curLine.push(item);
      curFontSize = Math.max(curFontSize, fontSize);
    }
  }
  if (curLine.length) {
    lines.push({ y: curY, fontSize: curFontSize, items: curLine });
  }

  const paragraphs = [];
  let curParaWords = [];
  let prevLine = null;

  lines.forEach((line) => {
    const isNewPara =
      !prevLine ||
      Math.abs(prevLine.y - line.y) > Math.max(line.fontSize, prevLine.fontSize) * 1.7 ||
      line.fontSize > prevLine.fontSize * 1.18;

    if (isNewPara && curParaWords.length) {
      paragraphs.push(buildParagraphObj(curParaWords, paragraphs.length, words.length, baseFontSize));
      curParaWords = [];
    }

    line.items.forEach((item, itemIdx) => {
      const str = item.str.normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '');
      const regex = /\S+/g;
      let match;
      const itemWidth = item.width || 0;
      const strLen = Math.max(1, str.length);
      const charWidth = itemWidth / strLen;
      const itemX = item.transform[4];
      const itemY = item.transform[5];
      const fontSize = Math.hypot(item.transform[0], item.transform[1]) || 12;

      while ((match = regex.exec(str)) !== null) {
        const wordText = match[0];
        const startChar = match.index;
        const pdfX = itemX + startChar * charWidth;
        const pdfY = itemY;
        const pdfW = wordText.length * charWidth;
        const pdfH = fontSize;

        const wordObj = {
          text: wordText,
          page: pageNo,
          pageWordIndex,
          itemIdx,
          fontSize,
          pdfBox: { x: pdfX, y: pdfY, w: pdfW, h: pdfH },
          id: `w_${pageNo}_${pageWordIndex}`
        };

        words.push(wordObj);
        curParaWords.push(wordObj);
        pageWordIndex++;
      }
    });

    prevLine = line;
  });

  if (curParaWords.length) {
    paragraphs.push(buildParagraphObj(curParaWords, paragraphs.length, words.length, baseFontSize));
  }

  const rawText = words.map((w) => w.text).join(' ');
  return { words, paragraphs, rawText, isScanned: words.length === 0 };
}

function buildParagraphObj(words, paraIndex = 0, wordsSoFar = 0, baseFontSize = 14) {
  const avgFontSize = words.reduce((acc, w) => acc + w.fontSize, 0) / words.length;
  // Headings MUST be significantly larger than base body text of the page
  const isMuchBigger = avgFontSize >= baseFontSize * 1.25;
  const isSlightlyBigger = avgFontSize >= baseFontSize * 1.14;
  
  // Headings can only be located near the top of the page / chapter start
  const isTopPosition = paraIndex <= 1 || wordsSoFar <= 30;
  
  const isTitle = isTopPosition && isMuchBigger && words.length <= 15;
  const isSubtitle =
    (isTopPosition && isSlightlyBigger && words.length <= 18) ||
    (isMuchBigger && words.length <= 8);

  return { isTitle, isSubtitle, fontSize: avgFontSize, words };
}

/* =========================================================
   5. RENDERING & YELLOW HIGHLIGHTING
   ========================================================= */
async function renderCurrentPage() {
  if (!state.pdf || state.isRendering) return;

  state.isRendering = true;
  setPageLoading(true);

  try {
    const pageNo = state.currentPage;
    const pageData = await getPageData(pageNo);
    state.currentWords = pageData.words;

    if (!pageData.words.length && state.settings.autoOcr && !pageData._ocrAttempted) {
      pageData._ocrAttempted = true;
      showToast(`Trang ${pageNo} dạng ảnh: Đang tự động quét OCR…`, 2500);
      runOcrOnCurrentPage();
      return;
    }

    if (state.currentWordIndex >= pageData.words.length) {
      state.currentWordIndex = Math.max(0, pageData.words.length - 1);
    }

    updateNavStats();
    saveProgress();

    if (state.mode === 'text') {
      renderTextMode(pageData);
    } else {
      await renderPdfMode(pageData);
    }

    highlightCurrentWord();
    preloadNeighbors(pageNo);
  } finally {
    state.isRendering = false;
    setPageLoading(false);
  }
}

function renderTextMode(pageData) {
  els.textSheet.hidden = false;
  els.pdfCanvasContainer.hidden = true;
  els.sheetBookTitle.textContent = state.fileName;
  els.sheetChapterTitle.textContent = `Trang ${state.currentPage}`;
  els.sheetPageNum.textContent = `Trang ${state.currentPage}`;

  if (!pageData.paragraphs.length) {
    state.activeWordElement = null;
    els.sheetBody.innerHTML = `
      <div class="empty-page-notice">
        <div class="empty-icon">📄</div>
        <h3>Tài liệu dạng Scan (hình ảnh)</h3>
        <p>Không tìm thấy lớp văn bản số trên trang này. Bạn có thể xem bản gốc PDF hoặc sử dụng tính năng OCR.</p>
        <button class="switch-pdf-btn" id="quickSwitchPdfBtn">Xem bản gốc PDF →</button>
      </div>
    `;
    $('quickSwitchPdfBtn')?.addEventListener('click', () => setMode('pdf'));
    return;
  }

  let html = '';
  pageData.paragraphs.forEach((p, pIdx) => {
    const wordHtml = p.words
      .map(
        (w) =>
          `<span class="word-token" id="${w.id}" data-idx="${w.pageWordIndex}">${escapeHtml(w.text)}</span>`
      )
      .join(' ');

    if (p.isTitle) {
      html += `<h1>${wordHtml}</h1>`;
    } else if (p.isSubtitle) {
      html += `<h2>${wordHtml}</h2>`;
    } else {
      const cls = pIdx === 0 && !p.isTitle ? 'lead' : '';
      html += `<p class="${cls}">${wordHtml}</p>`;
    }
  });

  els.sheetBody.innerHTML = html;
  state.activeWordElement = null;
}

async function renderPdfMode(pageData) {
  els.textSheet.hidden = true;
  els.pdfCanvasContainer.hidden = false;

  const page = pageData.page;
  const baseViewport = page.getViewport({ scale: 1.0 });
  const containerW = els.readerSurface.clientWidth - 48;
  const fitScale = Math.min(2.0, Math.max(0.65, containerW / baseViewport.width));
  const finalScale = fitScale * state.pdfZoom;

  const viewport = page.getViewport({ scale: finalScale });
  const canvas = els.pdfCanvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  ctx.save();
  ctx.scale(dpr, dpr);
  await page.render({ canvasContext: ctx, viewport }).promise;
  ctx.restore();

  pageData.words.forEach((w) => {
    const pt1 = viewport.convertToViewportPoint(w.pdfBox.x, w.pdfBox.y + w.pdfBox.h);
    const pt2 = viewport.convertToViewportPoint(w.pdfBox.x + w.pdfBox.w, w.pdfBox.y);
    w.scaledBox = {
      x: Math.min(pt1[0], pt2[0]),
      y: Math.min(pt1[1], pt2[1]),
      w: Math.abs(pt2[0] - pt1[0]),
      h: Math.abs(pt2[1] - pt1[1])
    };
  });

  els.pdfTextLayer.innerHTML = '';
  els.pdfTextLayer.style.width = `${viewport.width}px`;
  els.pdfTextLayer.style.height = `${viewport.height}px`;
  try {
    const textLayer = new TextLayer({
      textContentSource: pageData.textContent,
      container: els.pdfTextLayer,
      viewport
    });
    await textLayer.render();
  } catch (e) {
    // ignore
  }

  els.zoomValueLabel.textContent = `${Math.round(state.pdfZoom * 100)}%`;
}

function keepElementVisible(element, margin = 120) {
  if (!element || element.hidden || typeof element.getBoundingClientRect !== 'function') return;

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const isAboveViewport = rect.top < margin;
  const isBelowViewport = rect.bottom > viewportHeight - margin;

  if (!isAboveViewport && !isBelowViewport) return;

  // Text mode scrolls the document; PDF mode may scroll its own canvas container.
  let scrollParent = element.parentElement;
  while (scrollParent && scrollParent !== document.body) {
    const style = window.getComputedStyle(scrollParent);
    const canScroll = /(auto|scroll)/.test(style.overflowY) &&
      scrollParent.scrollHeight > scrollParent.clientHeight;
    if (canScroll) break;
    scrollParent = scrollParent.parentElement;
  }

  if (scrollParent && scrollParent !== document.body) {
    const parentRect = scrollParent.getBoundingClientRect();
    const targetOffset = rect.top - parentRect.top -
      (scrollParent.clientHeight - rect.height) / 2;
    scrollParent.scrollTop += targetOffset;
    return;
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  const targetScrollTop = scrollingElement.scrollTop + rect.top -
    (viewportHeight - rect.height) / 2;
  scrollingElement.scrollTop = Math.max(0, targetScrollTop);
}

function highlightCurrentWord() {
  const words = state.currentWords;
  if (!words || !words.length) {
    els.pdfWordHighlight.hidden = true;
    return;
  }

  const word = words[state.currentWordIndex];
  if (!word) return;

  if (state.mode === 'text') {
    els.pdfWordHighlight.hidden = true;
    if (state.activeWordElement) {
      state.activeWordElement.classList.remove('active-highlight');
    }

    const newActive = document.getElementById(word.id);
    if (newActive) {
      state.activeWordElement = newActive;
      newActive.classList.add('active-highlight');
      keepElementVisible(newActive);
    }
  }

  if (state.mode === 'pdf') {
    if (word.scaledBox) {
      els.pdfWordHighlight.hidden = false;
      els.pdfWordHighlight.style.left = `${word.scaledBox.x - 2}px`;
      els.pdfWordHighlight.style.top = `${word.scaledBox.y - 1}px`;
      els.pdfWordHighlight.style.width = `${word.scaledBox.w + 4}px`;
      els.pdfWordHighlight.style.height = `${word.scaledBox.h + 2}px`;
      keepElementVisible(els.pdfWordHighlight);
    }
  }

  updateNavStats();
}

function moveWord(delta) {
  if (state.isRendering) return;

  const words = state.currentWords;
  if (!words.length) {
    if (delta > 0) nextPage();
    else prevPage();
    return;
  }

  const nextIdx = state.currentWordIndex + delta;

  if (nextIdx >= 0 && nextIdx < words.length) {
    state.currentWordIndex = nextIdx;
    highlightCurrentWord();
  } else if (nextIdx >= words.length) {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      state.currentWordIndex = 0;
      renderCurrentPage();
    }
  } else if (nextIdx < 0) {
    if (state.currentPage > 1) {
      state.currentPage--;
      getPageData(state.currentPage).then((prevData) => {
        state.currentWordIndex = Math.max(0, prevData.words.length - 1);
        renderCurrentPage();
      });
    }
  }
}

function startContinuousNav(dir) {
  if (state.keyHoldTimer || state.keyHoldInterval) return;
  moveWord(dir);

  state.keyHoldTimer = setTimeout(() => {
    state.keyHoldInterval = setInterval(() => {
      moveWord(dir);
    }, 65);
  }, 220);
}

function stopContinuousNav() {
  if (state.keyHoldTimer) {
    clearTimeout(state.keyHoldTimer);
    state.keyHoldTimer = null;
  }
  if (state.keyHoldInterval) {
    clearInterval(state.keyHoldInterval);
    state.keyHoldInterval = null;
  }
}

function nextPage() {
  if (!state.isRendering && state.currentPage < state.totalPages) {
    state.currentPage++;
    state.currentWordIndex = 0;
    renderCurrentPage();
  }
}

function prevPage() {
  if (!state.isRendering && state.currentPage > 1) {
    state.currentPage--;
    state.currentWordIndex = 0;
    renderCurrentPage();
  }
}

function jumpToPage(target) {
  if (state.isRendering) return;
  const pageNo = Math.max(1, Math.min(state.totalPages, parseInt(target, 10) || 1));
  state.currentPage = pageNo;
  state.currentWordIndex = 0;
  renderCurrentPage();
}

function setMode(newMode) {
  state.mode = newMode;
  els.modeTextBtn.classList.toggle('active', newMode === 'text');
  els.modePdfBtn.classList.toggle('active', newMode === 'pdf');

  els.pdfZoomGroup.hidden = newMode !== 'pdf';
  renderCurrentPage();
}

function setPageLoading(isLoading) {
  els.readerLoading.hidden = !isLoading;
}

function updateNavStats() {
  const total = state.totalPages;
  const current = state.currentPage;
  const wordsCount = state.currentWords.length;
  const wordIdx = wordsCount ? state.currentWordIndex + 1 : 0;

  if (els.pageNumberInput) els.pageNumberInput.value = current;
  if (els.progressScrubber) els.progressScrubber.value = current;

  const pct = total > 1 ? Math.round((current / total) * 100) : 0;
  
  // Left Sidebar % Display
  if (els.progressPercent) els.progressPercent.textContent = `${pct}%`;
  if (els.progressRing) {
    els.progressRing.style.setProperty('--progress-deg', `${Math.round(pct * 3.6)}deg`);
  }
  if (els.progressBar) els.progressBar.style.width = `${pct}%`;

  // Left Sidebar Stats
  if (els.pageNumber) els.pageNumber.textContent = total;
  if (els.wordNumber) els.wordNumber.textContent = `${wordIdx} / ${wordsCount}`;

  // Right Header & Tools
  if (els.pageLabel) els.pageLabel.textContent = `Trang ${current} / ${total}`;
  if (els.sheetDocProgress) els.sheetDocProgress.textContent = `${pct}% đã đọc`;
  if (els.scrubberTooltip) els.scrubberTooltip.textContent = `Trang ${current} (${pct}%)`;
  if (els.sheetWordCounter) els.sheetWordCounter.textContent = `Từ ${wordIdx} / ${wordsCount}`;
  if (els.dockPageInfo) els.dockPageInfo.textContent = `Trang ${current} / ${total} • Từ ${wordIdx} / ${wordsCount}`;

  if (els.prevPageBtn) els.prevPageBtn.disabled = current <= 1 && wordIdx <= 1;
  if (els.nextPageBtn) els.nextPageBtn.disabled = current >= total && wordIdx >= wordsCount;
  if (els.dockPrevBtn) els.dockPrevBtn.disabled = els.prevPageBtn?.disabled;
  if (els.dockNextBtn) els.dockNextBtn.disabled = els.nextPageBtn?.disabled;
}

function preloadNeighbors(pageNo) {
  if (pageNo + 1 <= state.totalPages && !state.pageCache.has(pageNo + 1)) {
    getPageData(pageNo + 1);
  }
  if (pageNo - 1 >= 1 && !state.pageCache.has(pageNo - 1)) {
    getPageData(pageNo - 1);
  }
  trimPageCache(pageNo);
}

function trimPageCache(currentPage) {
  for (const [pageNo, pageData] of state.pageCache) {
    if (Math.abs(pageNo - currentPage) <= PAGE_CACHE_RADIUS || pageNo === state.currentPage) continue;
    pageData.page?.cleanup?.();
    state.pageCache.delete(pageNo);
  }
}

/* =========================================================
   6. OCR RECOGNITION (Tesseract.js for scanned PDFs)
   ========================================================= */
async function runOcrOnCurrentPage() {
  const pageNo = state.currentPage;
  els.ocrBanner.hidden = true;
  if (els.toolbarOcrBtn) {
    els.toolbarOcrBtn.classList.add('running');
    els.toolbarOcrBtn.innerHTML = '<span>⚡ Đang quét OCR…</span>';
  }
  els.ocrProgressWrap.hidden = false;
  els.ocrProgressText.textContent = `Đang tải bộ nhận dạng OCR (tiếng Việt/Anh)…`;
  els.ocrProgressFill.style.width = '15%';

  try {
    if (!window.Tesseract) {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }

    els.ocrProgressText.textContent = `Đang dựng trang ảnh phục vụ OCR…`;
    els.ocrProgressFill.style.width = '30%';

    const pageData = await getPageData(pageNo);
    const page = pageData.page;
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    els.ocrProgressText.textContent = `Đang nhận dạng văn bản tiếng Việt…`;
    els.ocrProgressFill.style.width = '50%';

    const worker = await window.Tesseract.createWorker('vie+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const p = Math.round(50 + m.progress * 45);
          els.ocrProgressFill.style.width = `${p}%`;
          els.ocrProgressText.textContent = `Đang nhận dạng: ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    const ret = await worker.recognize(canvas);
    await worker.terminate();

    const tWords = ret.data.words || [];
    if (!tWords.length) {
      showToast('OCR không nhận dạng được chữ nào trên trang này.');
      els.ocrProgressWrap.hidden = true;
      return;
    }

    const ocrWords = [];
    tWords.forEach((tw, idx) => {
      const text = tw.text.trim();
      if (!text) return;
      const b = tw.bbox;
      const box = { x: b.x0 / 2, y: b.y0 / 2, w: (b.x1 - b.x0) / 2, h: (b.y1 - b.y0) / 2 };
      ocrWords.push({
        text,
        page: pageNo,
        pageWordIndex: idx,
        fontSize: box.h,
        pdfBox: box,
        id: `w_${pageNo}_${idx}`
      });
    });

    pageData.words = ocrWords;
    pageData.isScanned = false;
    pageData.paragraphs = [
      { isTitle: false, isSubtitle: false, fontSize: 16, words: ocrWords }
    ];

    els.ocrProgressFill.style.width = '100%';
    els.ocrProgressText.textContent = `Nhận dạng hoàn tất (${ocrWords.length} từ)!`;
    setTimeout(() => {
      els.ocrProgressWrap.hidden = true;
      renderCurrentPage();
      showToast(`Đã nhận dạng ${ocrWords.length} từ bằng OCR. Bạn có thể bôi vàng ngay!`);
    }, 600);
  } catch (err) {
    console.error('OCR Error:', err);
    els.ocrProgressWrap.hidden = true;
    showToast('Lỗi nhận dạng OCR: ' + err.message, 4500);
  } finally {
    if (els.toolbarOcrBtn) {
      els.toolbarOcrBtn.classList.remove('running');
      els.toolbarOcrBtn.innerHTML = '<span>⚡ Quét OCR</span>';
    }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* =========================================================
   6B. EDIT PAGE TEXT (Sửa lỗi chính tả hoặc ký tự lạ)
   ========================================================= */
function openEditPageModal() {
  const pageNo = state.currentPage;
  const pageData = state.pageCache.get(pageNo);
  if (!pageData) return;

  if (els.editPageModalTitle) {
    els.editPageModalTitle.textContent = `Chỉnh sửa văn bản Trang ${pageNo}`;
  }

  let text = '';
  if (pageData.paragraphs && pageData.paragraphs.length) {
    text = pageData.paragraphs
      .map((p) => p.words.map((w) => w.text).join(' '))
      .join('\n\n');
  } else if (pageData.words && pageData.words.length) {
    text = pageData.words.map((w) => w.text).join(' ');
  }

  if (els.editPageTextarea) {
    els.editPageTextarea.value = text;
    els.editPageTextarea._origText = text;
  }
  if (els.editPageModal) els.editPageModal.hidden = false;
}

function closeEditPageModal() {
  if (els.editPageModal) els.editPageModal.hidden = true;
}

function saveEditedPageText() {
  const pageNo = state.currentPage;
  const pageData = state.pageCache.get(pageNo);
  if (!pageData) return;

  const newText = (els.editPageTextarea?.value || '').trim();
  if (!newText) {
    showToast('Văn bản trang không được để trống.');
    return;
  }

  const rawParas = newText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const newWords = [];
  const newParagraphs = [];
  let pageWordIndex = 0;

  rawParas.forEach((paraStr, pIdx) => {
    const tokens = paraStr.match(/\S+/g) || [];
    const paraWords = [];

    tokens.forEach((t) => {
      const wordObj = {
        text: t,
        page: pageNo,
        pageWordIndex,
        fontSize: 16,
        pdfBox: { x: 50, y: 100 + pageWordIndex * 8, w: t.length * 8, h: 16 },
        id: `w_${pageNo}_${pageWordIndex}`
      };
      newWords.push(wordObj);
      paraWords.push(wordObj);
      pageWordIndex++;
    });

    if (paraWords.length) {
      newParagraphs.push({
        isTitle: pIdx === 0 && paraWords.length <= 10 && tokens[0] === tokens[0].toUpperCase(),
        isSubtitle: false,
        fontSize: 16,
        words: paraWords
      });
    }
  });

  pageData.words = newWords;
  pageData.paragraphs = newParagraphs;
  pageData.rawText = newWords.map((w) => w.text).join(' ');
  pageData.isScanned = false;

  closeEditPageModal();
  state.currentWordIndex = 0;
  renderCurrentPage();
  showToast(`Đã lưu và cập nhật ${newWords.length} từ cho trang ${pageNo}!`);
}

/* =========================================================
   7. TTS AUDIO BOOK
   ========================================================= */
function setupTTSVoice() {
  if (!state.tts.synth) return;
  const loadVoices = () => {
    const voices = state.tts.synth.getVoices();
    const viVoice = voices.find(
      (v) => v.lang.startsWith('vi') || v.name.toLowerCase().includes('vietnam')
    );
    state.tts.voice = viVoice || voices[0] || null;
  };
  loadVoices();
  if (state.tts.synth.onvoiceschanged !== undefined) {
    state.tts.synth.onvoiceschanged = loadVoices;
  }
}

async function toggleTTS() {
  if (!state.tts.synth) {
    showToast('Trình duyệt không hỗ trợ Web Speech Synthesis.');
    return;
  }
  if (state.tts.speaking) {
    stopTTS();
    return;
  }
  startTTS();
}

async function startTTS() {
  const pageData = await getPageData(state.currentPage);
  const text = pageData.rawText;
  if (!text || !text.trim()) {
    showToast('Trang này không có văn bản để đọc.');
    return;
  }

  state.tts.synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (state.tts.voice) utterance.voice = state.tts.voice;
  utterance.rate = state.tts.rate;
  utterance.lang = 'vi-VN';

  utterance.onstart = () => {
    state.tts.speaking = true;
    state.tts.paused = false;
    els.ttsBar.hidden = false;
    els.ttsToggleBtn.classList.add('active');
    els.ttsStatusText.textContent = `Đang đọc Trang ${state.currentPage}…`;
    els.ttsPlayIcon.textContent = '❚❚';
  };

  utterance.onboundary = (e) => {
    if (e.name === 'word') {
      moveWord(1);
    }
  };

  utterance.onend = () => {
    state.tts.speaking = false;
    if (state.currentPage < state.totalPages) {
      nextPage();
      setTimeout(startTTS, 500);
    } else {
      stopTTS();
      showToast('Đã đọc xong cuốn sách!');
    }
  };

  utterance.onerror = () => stopTTS();
  state.tts.synth.speak(utterance);
}

function stopTTS() {
  if (state.tts.synth) state.tts.synth.cancel();
  state.tts.speaking = false;
  state.tts.paused = false;
  els.ttsBar.hidden = true;
  els.ttsToggleBtn.classList.remove('active');
}

/* =========================================================
   8. PERSISTENCE & RECENT LIST
   ========================================================= */
function saveProgress() {
  try {
    const data = {
      fileName: state.fileName,
      page: state.currentPage,
      wordIndex: state.currentWordIndex,
      totalPages: state.totalPages,
      timestamp: Date.now()
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Could not save progress:', err);
  }
}

function getProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRecentBook(item) {
  try {
    const list = getRecentBooks().filter((x) => x.name !== item.name);
    const updated = [item, ...list].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    renderRecentList();
  } catch (err) {
    console.warn('Could not save recent:', err);
  }
}

function getRecentBooks() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function renderRecentList() {
  const books = getRecentBooks();
  els.recentSection.hidden = books.length === 0;
  els.recentCount.textContent = books.length;

  els.recentList.innerHTML = books
    .map(
      (b) => `
    <div class="recent-card">
      <div class="recent-left">
        <div class="recent-book-icon">PDF</div>
        <div class="recent-meta">
          <strong>${escapeHtml(b.name)}</strong>
          <small>${b.pages || '—'} trang • ${b.size || ''}</small>
        </div>
      </div>
      <button class="recent-resume-btn" data-resume-id="${b.id || ''}" data-resume-name="${encodeURIComponent(b.name)}">
        Đọc tiếp →
      </button>
    </div>
  `
    )
    .join('');

  els.recentList.querySelectorAll('[data-resume-name]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = decodeURIComponent(btn.dataset.resumeName);
      if (name === '38LaThuRockefellerGuiChoConTrai.pdf') {
        processPdfFile('/38LaThuRockefellerGuiChoConTrai.pdf', name);
      } else {
        els.fileInput.click();
        showToast('Chọn file PDF từ máy để tiếp tục đọc.');
      }
    });
  });
}

/* =========================================================
   9. EVENT LISTENERS
   ========================================================= */
function setupEventListeners() {
  // Brand Logo Click -> Back to Workspace
  els.homeLogoButton.addEventListener('click', () => {
    els.readerView.hidden = true;
    els.workspaceView.hidden = false;
    els.readerDocPill.hidden = true;
    els.readerActions.hidden = true;
    els.workspaceActions.hidden = false;
    stopTTS();
  });
  els.backToHomeBtn.addEventListener('click', () => els.homeLogoButton.click());

  // Upload Buttons
  els.chooseFileBtn.addEventListener('click', () => els.fileInput.click());
  els.changeFileBtn.addEventListener('click', () => els.fileInput.click());
  els.dockChangeFileBtn.addEventListener('click', () => els.fileInput.click());
  els.errorRetryBtn.addEventListener('click', () => {
    hideErrorModal();
    els.fileInput.click();
  });
  els.errorCloseBtn.addEventListener('click', hideErrorModal);

  // File Input Change
  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      processPdfFile(file);
    }
    e.target.value = '';
  });

  // Drag and Drop
  ['dragenter', 'dragover'].forEach((ev) => {
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropZone.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((ev) => {
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('dragging');
    });
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('dragging');
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processPdfFile(files[0]);
    }
  });

  // Sample book open
  els.openDefaultBookBtn.addEventListener('click', () => {
    processPdfFile(
      '/38LaThuRockefellerGuiChoConTrai.pdf',
      '38LaThuRockefellerGuiChoConTrai.pdf',
      1490474
    );
  });

  // Mode Switches in Left Sidebar
  els.modeTextBtn.addEventListener('click', () => setMode('text'));
  els.modePdfBtn.addEventListener('click', () => setMode('pdf'));

  // Page Navigation Handlers
  els.prevPageBtn.addEventListener('click', prevPage);
  els.nextPageBtn.addEventListener('click', nextPage);
  els.dockPrevBtn.addEventListener('click', () => moveWord(-1));
  els.dockNextBtn.addEventListener('click', () => moveWord(1));

  els.edgePrevBtn.addEventListener('click', () => moveWord(-1));
  els.edgeNextBtn.addEventListener('click', () => moveWord(1));

  // Page direct input
  els.pageNumberInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
      jumpToPage(e.target.value);
    }
  });
  els.pageNumberInput.addEventListener('change', (e) => jumpToPage(e.target.value));

  // Scrubber Slider
  els.progressScrubber.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    const pct = Math.round((val / state.totalPages) * 100);
    els.scrubberTooltip.textContent = `Trang ${val} (${pct}%)`;
  });
  els.progressScrubber.addEventListener('change', (e) => jumpToPage(e.target.value));

  // One delegated listener keeps large pages cheap to interact with.
  els.sheetBody.addEventListener('click', (e) => {
    const wordElement = e.target.closest('.word-token');
    if (!wordElement || !els.sheetBody.contains(wordElement)) return;

    state.currentWordIndex = parseInt(wordElement.dataset.idx, 10);
    highlightCurrentWord();
  });

  // Zoom Controls
  els.zoomInBtn.addEventListener('click', () => {
    state.pdfZoom = Math.min(2.5, state.pdfZoom + 0.15);
    renderPdfMode(state.pageCache.get(state.currentPage));
  });
  els.zoomOutBtn.addEventListener('click', () => {
    state.pdfZoom = Math.max(0.5, state.pdfZoom - 0.15);
    renderPdfMode(state.pageCache.get(state.currentPage));
  });
  els.zoomFitBtn.addEventListener('click', () => {
    state.pdfZoom = 1.0;
    renderPdfMode(state.pageCache.get(state.currentPage));
  });

  // OCR Handlers
  els.runOcrBtn.addEventListener('click', runOcrOnCurrentPage);
  els.ocrTriggerBtn.addEventListener('click', runOcrOnCurrentPage);
  if (els.toolbarOcrBtn) {
    els.toolbarOcrBtn.addEventListener('click', runOcrOnCurrentPage);
  }
  els.closeOcrBannerBtn.addEventListener('click', () => {
    els.ocrBanner.hidden = true;
  });

  // Edit Page Text Modal Handlers
  if (els.editPageBtn) {
    els.editPageBtn.addEventListener('click', openEditPageModal);
  }
  if (els.editPageCloseBtn) {
    els.editPageCloseBtn.addEventListener('click', closeEditPageModal);
  }
  if (els.editModalCancelBtn) {
    els.editModalCancelBtn.addEventListener('click', closeEditPageModal);
  }
  if (els.editModalSaveBtn) {
    els.editModalSaveBtn.addEventListener('click', saveEditedPageText);
  }
  if (els.editModalOcrBtn) {
    els.editModalOcrBtn.addEventListener('click', () => {
      closeEditPageModal();
      runOcrOnCurrentPage();
    });
  }
  if (els.editModalResetBtn) {
    els.editModalResetBtn.addEventListener('click', () => {
      if (els.editPageTextarea?._origText !== undefined) {
        els.editPageTextarea.value = els.editPageTextarea._origText;
        showToast('Đã khôi phục văn bản gốc.');
      }
    });
  }

  // TTS
  els.ttsToggleBtn.addEventListener('click', toggleTTS);
  els.ttsPlayPauseBtn.addEventListener('click', () => {
    if (state.tts.paused) {
      state.tts.synth.resume();
      state.tts.paused = false;
      els.ttsPlayIcon.textContent = '❚❚';
    } else {
      state.tts.synth.pause();
      state.tts.paused = true;
      els.ttsPlayIcon.textContent = '▶';
    }
  });
  els.ttsStopBtn.addEventListener('click', stopTTS);
  els.ttsCloseBtn.addEventListener('click', stopTTS);
  els.ttsRateSelect.addEventListener('change', (e) => {
    state.tts.rate = parseFloat(e.target.value);
    if (state.tts.speaking) {
      stopTTS();
      setTimeout(startTTS, 100);
    }
  });

  // Font Size Steppers (Sidebar & Toolbar)
  els.fontDecBtn.addEventListener('click', () => changeFontSize(-1, true));
  els.fontIncBtn.addEventListener('click', () => changeFontSize(1, true));
  if (els.toolbarFontDecBtn) {
    els.toolbarFontDecBtn.addEventListener('click', () => changeFontSize(-1, true));
  }
  if (els.toolbarFontIncBtn) {
    els.toolbarFontIncBtn.addEventListener('click', () => changeFontSize(1, true));
  }

  // Font Size Presets (16, 19, 22, 26)
  document.querySelectorAll('.font-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sz = parseInt(btn.dataset.preset, 10);
      if (sz) changeFontSize(sz, false);
    });
  });

  // Uniform Font Size Toggle (Chống chữ quá to)
  if (els.uniformFontToggle) {
    els.uniformFontToggle.addEventListener('change', (e) => {
      state.settings.uniformFont = e.target.checked;
      applySettings();
      saveSettings();
      showToast(
        e.target.checked
          ? 'Đã bật cỡ chữ đồng đều (chuẩn hóa tiêu đề to).'
          : 'Đã tắt cỡ chữ đồng đều.'
      );
    });
  }

  // Appearance Popover
  els.appearanceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.appearancePopover.hidden = !els.appearancePopover.hidden;
  });
  els.appearanceCloseBtn.addEventListener('click', () => {
    els.appearancePopover.hidden = true;
  });
  document.addEventListener('click', (e) => {
    if (
      !els.appearancePopover.hidden &&
      !els.appearancePopover.contains(e.target) &&
      e.target !== els.appearanceBtn
    ) {
      els.appearancePopover.hidden = true;
    }
  });

  // Themes
  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.theme = btn.dataset.setTheme;
      saveSettings();
      applySettings();
    });
  });

  // Fonts
  document.querySelectorAll('[data-set-font]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.font = btn.dataset.setFont;
      saveSettings();
      applySettings();
    });
  });

  // Popover Font Size Slider
  if (els.fontSizeSlider) {
    els.fontSizeSlider.addEventListener('input', (e) => {
      changeFontSize(parseInt(e.target.value, 10), false);
    });
  }

  // Line Height
  document.querySelectorAll('[data-set-line-height]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.lineHeight = parseFloat(btn.dataset.setLineHeight);
      saveSettings();
      applySettings();
    });
  });

  // Width
  document.querySelectorAll('[data-set-width]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.width = btn.dataset.setWidth;
      saveSettings();
      applySettings();
    });
  });

  // Fullscreen
  els.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // KEYBOARD NAVIGATION: Holding arrow keys for continuous sequential yellow highlighting
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (els.readerView.hidden) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (!e.repeat) startContinuousNav(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!e.repeat) startContinuousNav(-1);
    } else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
      e.preventDefault();
      nextPage();
    } else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
      e.preventDefault();
      prevPage();
    } else if (e.key === 't' || e.key === 'T') {
      toggleTTS();
    } else if (e.key === 'f' || e.key === 'F') {
      els.fullscreenBtn.click();
    } else if (e.key === 'Escape') {
      els.appearancePopover.hidden = true;
      hideErrorModal();
      stopTTS();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      stopContinuousNav();
    }
  });

  window.addEventListener('blur', stopContinuousNav);
}

/* =========================================================
   UTILITIES
   ========================================================= */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(str) {
  return (str || '').replace(
    /[&<>'"]/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[c]
  );
}

// Daily visitor counter is independent from the reader UI startup.
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/visits/today', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const counter = document.getElementById('todayVisitorCount');
      if (counter && data && Number.isFinite(data.count)) {
        counter.textContent = data.count.toLocaleString('vi-VN');
      }
    })
    .catch(() => {});
});

// Start application
window.addEventListener('DOMContentLoaded', init);
