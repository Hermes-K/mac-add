/**
 * MAC Address Vendor Lookup Engine
 * 100% Client-Side In-Memory Evaluation
 */

(function () {
  'use strict';

  // DOM Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const macInput = document.getElementById('macInput');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const singleResultCard = document.getElementById('singleResultCard');
  const sampleChips = document.querySelectorAll('.sample-chip');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  // Batch DOM Elements
  const batchInput = document.getElementById('batchInput');
  const batchAnalyzeBtn = document.getElementById('batchAnalyzeBtn');
  const batchClearBtn = document.getElementById('batchClearBtn');
  const batchExportBtn = document.getElementById('batchExportBtn');
  const batchSampleBtn = document.getElementById('batchSampleBtn');
  const batchResultsWrapper = document.getElementById('batchResultsWrapper');
  const batchTableBody = document.getElementById('batchTableBody');
  const batchStats = document.getElementById('batchStats');

  // Search Vendor Directory Elements
  const vendorSearchInput = document.getElementById('vendorSearchInput');
  const vendorSearchResultList = document.getElementById('vendorSearchResultList');
  const vendorSearchCount = document.getElementById('vendorSearchCount');

  // History storage
  const HISTORY_KEY = 'mac_lookup_history_v1';
  let lookupHistory = [];

  // Database check
  const db = window.OUI_DATABASE || {};
  const totalEntries = Object.keys(db).length;
  const dbCountEl = document.getElementById('dbCount');
  if (dbCountEl) {
    dbCountEl.textContent = totalEntries.toLocaleString() + '개 제조사 OUI 로드됨 (오프라인)';
  }

  // Init
  initTabs();
  loadHistory();
  bindEvents();

  // Initial single lookup if input has value
  if (macInput.value.trim()) {
    performSingleLookup(macInput.value.trim());
  }

  /* -------------------------------------------------------------
     TAB NAVIGATION
  ------------------------------------------------------------- */
  function initTabs() {
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${target}`).classList.add('active');
      });
    });
  }

  /* -------------------------------------------------------------
     MAC PARSER & ANALYZER CORE
  ------------------------------------------------------------- */
  /**
   * Sanitizes input to raw hex characters
   */
  function cleanHex(str) {
    if (!str) return '';
    return str.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  }

  /**
   * Analyzes MAC Address hex
   */
  function analyzeMac(rawInput) {
    const cleaned = cleanHex(rawInput);
    if (!cleaned || cleaned.length < 6) {
      return {
        isValid: false,
        raw: rawInput,
        error: '최소 6자리 16진수(OUI)를 입력해 주세요.'
      };
    }

    // OUI is the first 6 hex characters (24 bits)
    const oui = cleaned.substring(0, 6);
    const vendor = db[oui] || '알 수 없는 제조사 (Unknown / Unregistered OUI)';
    const isKnown = !!db[oui];

    // First byte for I/G and U/L flags
    const firstByteHex = oui.substring(0, 2);
    const firstByteVal = parseInt(firstByteHex, 16);

    // Bit 0 of 1st byte: 0 = Unicast, 1 = Multicast
    const isMulticast = (firstByteVal & 0x01) === 1;
    // Bit 1 of 1st byte: 0 = Globally Unique (OUI Enforced), 1 = Locally Administered (Randomized / Private)
    const isLocallyAdministered = (firstByteVal & 0x02) === 2;

    // Full 12 chars formatting (if full MAC provided)
    const isFullMac = cleaned.length >= 12;
    const full12 = cleaned.padEnd(12, '0').substring(0, 12);
    const nicPart = full12.substring(6, 12);

    const octets = [];
    for (let i = 0; i < full12.length; i += 2) {
      octets.push(full12.substring(i, i + 2));
    }

    // Diverse representation formats
    const formats = {
      standardColon: octets.join(':'),
      standardHyphen: octets.join('-'),
      ciscoDot: `${full12.substring(0, 4)}.${full12.substring(4, 8)}.${full12.substring(8, 12)}`,
      rawHex: full12,
      ouiOnly: `${oui.substring(0, 2)}:${oui.substring(2, 4)}:${oui.substring(4, 6)}`
    };

    return {
      isValid: true,
      raw: rawInput,
      cleaned,
      isFullMac,
      oui,
      nicPart,
      octets,
      vendor,
      isKnown,
      isMulticast,
      isLocallyAdministered,
      firstByteVal,
      formats
    };
  }

  /* -------------------------------------------------------------
     SINGLE LOOKUP RENDERING
  ------------------------------------------------------------- */
  function performSingleLookup(inputValue, saveToHist = true) {
    const result = analyzeMac(inputValue);

    if (!result.isValid) {
      singleResultCard.innerHTML = `
        <div class="empty-box">
          <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p style="color: #f87171; font-weight: 600;">${result.error}</p>
          <p style="font-size: 0.8rem; margin-top: 0.4rem; color: var(--text-muted);">예시: 00:1A:2B:3C:4D:5E 또는 001A2B</p>
        </div>
      `;
      return;
    }

    if (saveToHist) {
      addToHistory(result.formats.standardColon, result.vendor);
    }

    // Determine Status Badge
    let statusBadge = '';
    if (result.isLocallyAdministered) {
      statusBadge = `
        <div class="status-tag randomized" title="비트 1이 1로 설정됨: 모바일 기기의 MAC 랜덤화 기능 또는 가상머신/소프트웨어에서 생성된 사설 로컬 주소입니다.">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          랜덤/사설 MAC (Locally Administered)
        </div>
      `;
    } else if (result.isKnown) {
      statusBadge = `
        <div class="status-tag known">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          공식 등록 제조사 (IEEE OUI 일치)
        </div>
      `;
    } else {
      statusBadge = `
        <div class="status-tag unknown">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          미등록 OUI
        </div>
      `;
    }

    // Byte display blocks
    const byteBlocksHtml = result.octets.map((byte, idx) => {
      const isOui = idx < 3;
      const label = isOui ? `OUI [${idx}]` : `NIC [${idx - 3}]`;
      return `
        <div class="byte-block ${isOui ? 'oui' : 'nic'}">
          <div class="byte-hex ${isOui ? 'oui' : 'nic'}">${byte}</div>
          <div class="byte-desc">${label}</div>
        </div>
      `;
    }).join('');

    singleResultCard.innerHTML = `
      <div class="result-container">
        <!-- Main Vendor Box -->
        <div class="primary-result-box">
          <div class="vendor-highlight">
            <div>
              <div class="vendor-title-label">조회된 하드웨어 제조사 (Vendor / Organization)</div>
              <div class="vendor-title-name">${escapeHtml(result.vendor)}</div>
            </div>
            ${statusBadge}
          </div>

          <!-- Key Details Grid -->
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>
                OUI 접두사 (Hex)
              </div>
              <div class="detail-val mono">${result.oui.substring(0, 2)}:${result.oui.substring(2, 4)}:${result.oui.substring(4, 6)}</div>
            </div>

            <div class="detail-item">
              <div class="detail-label">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                전송 방식 (Cast Type)
              </div>
              <div class="detail-val">${result.isMulticast ? '<span style="color: #f59e0b">멀티캐스트 / 브로드캐스트</span>' : '<span style="color: #34d399">유니캐스트 (Unicast)</span>'}</div>
            </div>

            <div class="detail-item">
              <div class="detail-label">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                주소 할당 유형 (Administration)
              </div>
              <div class="detail-val">${result.isLocallyAdministered ? '<span style="color: #f59e0b">로컬 / 가상 / 랜덤 (Private)</span>' : '<span style="color: #38bdf8">글로벌 고유 (Universal IEEE OUI)</span>'}</div>
            </div>

            <div class="detail-item">
              <div class="detail-label">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/></svg>
                장비 고유 식별자 (NIC Part)
              </div>
              <div class="detail-val mono">${result.isFullMac ? result.nicPart.match(/.{1,2}/g).join(':') : '입력 생략됨 (OUI만 조회)'}</div>
            </div>
          </div>
        </div>

        <!-- Structure Visualizer -->
        <div class="mac-breakdown-card">
          <div class="breakdown-title">
            <span>MAC 주소 옥텟 구조 분해</span>
            <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted);">
              <span style="color: #22d3ee">■</span> OUI (제조사 24비트) &nbsp;
              <span style="color: #a5b4fc">■</span> NIC (디바이스 고유 24비트)
            </span>
          </div>

          <div class="bytes-display">
            ${byteBlocksHtml}
          </div>

          <!-- Bit Flag Explanations -->
          <div class="bit-flags">
            <div class="flag-box">
              <div class="flag-icon ${result.isLocallyAdministered ? 'amber' : 'blue'}">
                U/L
              </div>
              <div class="flag-info">
                <h4>U/L 비트 (Universal / Local): ${result.isLocallyAdministered ? '1 (Local)' : '0 (Universal)'}</h4>
                <p>${result.isLocallyAdministered 
                  ? '이 MAC은 로컬 관리 주소입니다. iOS/Android 개인정보 보호 랜덤 MAC, 또는 VMware/Hyper-V 등 가상화 NIC일 확률이 매우 높습니다.' 
                  : 'IEEE 등록 기관에서 하드웨어 칩셋에 영구 부여한 글로벌 유일 하드웨어 주소(BIA: Burned-In Address)입니다.'}
                </p>
              </div>
            </div>

            <div class="flag-box">
              <div class="flag-icon ${result.isMulticast ? 'amber' : 'green'}">
                I/G
              </div>
              <div class="flag-info">
                <h4>I/G 비트 (Individual / Group): ${result.isMulticast ? '1 (Group)' : '0 (Individual)'}</h4>
                <p>${result.isMulticast 
                  ? '멀티캐스트 또는 브로드캐스트 패킷 대상 주소입니다. 통상적인 단일 호스트의 물리 NIC 주소가 아닙니다.' 
                  : '개별 단말(호스트)을 가리키는 유니캐스트 고유 주소입니다.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Format Variations Card -->
        <div class="mac-breakdown-card">
          <div class="breakdown-title">
            <span>네트워크 장비별 표기 포맷 변환</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">클릭 시 즉시 클립보드 복사</span>
          </div>

          <div class="format-grid">
            <div class="format-card">
              <div>
                <div class="format-label">Linux / Unix / macOS (Colon)</div>
                <div class="format-value">${result.formats.standardColon}</div>
              </div>
              <button class="copy-mini-btn" data-copy="${result.formats.standardColon}" title="복사">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>

            <div class="format-card">
              <div>
                <div class="format-label">Windows (Hyphen)</div>
                <div class="format-value">${result.formats.standardHyphen}</div>
              </div>
              <button class="copy-mini-btn" data-copy="${result.formats.standardHyphen}" title="복사">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>

            <div class="format-card">
              <div>
                <div class="format-label">Cisco IOS (Dotted)</div>
                <div class="format-value">${result.formats.ciscoDot}</div>
              </div>
              <button class="copy-mini-btn" data-copy="${result.formats.ciscoDot}" title="복사">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>

            <div class="format-card">
              <div>
                <div class="format-label">Raw Hexadecimal</div>
                <div class="format-value">${result.formats.rawHex}</div>
              </div>
              <button class="copy-mini-btn" data-copy="${result.formats.rawHex}" title="복사">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind mini copy buttons
    singleResultCard.querySelectorAll('.copy-mini-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(btn.dataset.copy, '클립보드에 복사되었습니다.');
      });
    });
  }

  /* -------------------------------------------------------------
     BATCH LOOKUP LOGIC
  ------------------------------------------------------------- */
  let currentBatchData = [];

  function performBatchLookup() {
    const rawText = batchInput.value.trim();
    if (!rawText) {
      showToast('대량 조회할 MAC 주소 목록을 입력해 주세요.');
      return;
    }

    // Split by lines or commas or spaces
    const lines = rawText.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) {
      showToast('유효한 입력 라인이 없습니다.');
      return;
    }

    currentBatchData = [];
    let knownCount = 0;
    let localRandomCount = 0;

    lines.forEach((line, index) => {
      const res = analyzeMac(line);
      if (res.isValid) {
        if (res.isKnown) knownCount++;
        if (res.isLocallyAdministered) localRandomCount++;
      }
      currentBatchData.push({
        index: index + 1,
        input: line,
        result: res
      });
    });

    renderBatchResults(currentBatchData, knownCount, localRandomCount);
  }

  function renderBatchResults(data, knownCount, localRandomCount) {
    batchResultsWrapper.style.display = 'block';
    batchStats.innerHTML = `
      <span>총 <strong>${data.length}</strong>건</span> | 
      <span style="color: #34d399">식별 완료: <strong>${knownCount}</strong>건</span> | 
      <span style="color: #fbbf24">랜덤/사설 MAC: <strong>${localRandomCount}</strong>건</span>
    `;

    batchTableBody.innerHTML = data.map(item => {
      const res = item.result;
      if (!res.isValid) {
        return `
          <tr>
            <td>${item.index}</td>
            <td class="mono-cell" style="color: #f87171">${escapeHtml(item.input)}</td>
            <td>-</td>
            <td style="color: #f87171">형식 오류 (${res.error})</td>
            <td>-</td>
            <td>-</td>
          </tr>
        `;
      }

      let tagHtml = '';
      if (res.isLocallyAdministered) {
        tagHtml = '<span class="status-tag randomized" style="padding: 2px 6px; font-size: 0.72rem;">사설/랜덤</span>';
      } else if (res.isKnown) {
        tagHtml = '<span class="status-tag known" style="padding: 2px 6px; font-size: 0.72rem;">일치</span>';
      } else {
        tagHtml = '<span class="status-tag unknown" style="padding: 2px 6px; font-size: 0.72rem;">미등록</span>';
      }

      const castType = res.isMulticast ? '<span style="color:#f59e0b">멀티캐스트</span>' : '<span style="color:#34d399">유니캐스트</span>';

      return `
        <tr>
          <td>${item.index}</td>
          <td class="mono-cell">${res.formats.standardColon}</td>
          <td class="mono-cell" style="color: #94a3b8">${res.oui.substring(0, 2)}:${res.oui.substring(2, 4)}:${res.oui.substring(4, 6)}</td>
          <td style="font-weight: 600; color: #ffffff">${escapeHtml(res.vendor)}</td>
          <td>${castType}</td>
          <td>${tagHtml}</td>
        </tr>
      `;
    }).join('');

    batchResultsWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function exportBatchToCSV() {
    if (!currentBatchData || currentBatchData.length === 0) {
      showToast('내보낼 분석 결과가 없습니다.');
      return;
    }

    const headers = ['No', '입력값', '표준 MAC', 'OUI', '제조사', '전송유형', '사설랜덤여부'];
    const rows = currentBatchData.map(item => {
      const res = item.result;
      if (!res.isValid) {
        return [item.index, `"${item.input}"`, '오류', '', `"${res.error}"`, '', ''];
      }
      return [
        item.index,
        `"${item.input}"`,
        `"${res.formats.standardColon}"`,
        `"${res.oui}"`,
        `"${res.vendor.replace(/"/g, '""')}"`,
        res.isMulticast ? 'Multicast' : 'Unicast',
        res.isLocallyAdministered ? 'Yes(Local/Random)' : 'No(Universal)'
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `mac_vendor_lookup_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV 파일이 다운로드되었습니다.');
  }

  /* -------------------------------------------------------------
     SEARCH OUI DIRECTORY (BY VENDOR NAME)
  ------------------------------------------------------------- */
  let searchDebounceTimer = null;
  function searchVendorDirectory(keyword) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      const q = keyword.trim().toUpperCase();
      if (!q) {
        vendorSearchResultList.innerHTML = '<div class="empty-box"><p>검색어를 입력하면 실시간으로 제조사 OUI 목록을 찾습니다.</p></div>';
        vendorSearchCount.textContent = '0건';
        return;
      }

      const matches = [];
      for (const [oui, vendor] of Object.entries(db)) {
        if (vendor.toUpperCase().includes(q) || oui.includes(q)) {
          matches.push({ oui, vendor });
          if (matches.length >= 200) break; // cap at 200 for fast rendering
        }
      }

      vendorSearchCount.textContent = `${matches.length}${matches.length >= 200 ? '+ (상위 200건 표시)' : '건'}`;

      if (matches.length === 0) {
        vendorSearchResultList.innerHTML = `
          <div class="empty-box">
            <p><strong>"${escapeHtml(keyword)}"</strong>에 해당하는 제조사를 찾을 수 없습니다.</p>
          </div>
        `;
        return;
      }

      vendorSearchResultList.innerHTML = matches.map(item => {
        const formattedOui = `${item.oui.substring(0, 2)}:${item.oui.substring(2, 4)}:${item.oui.substring(4, 6)}`;
        return `
          <div class="format-card" style="cursor: pointer;" onclick="window.applyVendorLookup('${formattedOui}')">
            <div style="flex: 1; padding-right: 1rem;">
              <div style="font-weight: 700; color: #ffffff; font-size: 0.95rem;">${escapeHtml(item.vendor)}</div>
              <div class="format-label" style="margin-top: 0.2rem;">OUI 접두사: <span class="mono-cell">${formattedOui}</span> (${item.oui})</div>
            </div>
            <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.78rem;" title="이 OUI로 정밀 분석">
              분석하기 →
            </button>
          </div>
        `;
      }).join('');
    }, 200);
  }

  // Global helper for vendor directory item click
  window.applyVendorLookup = function (oui) {
    document.querySelector('.tab-btn[data-tab="single"]').click();
    macInput.value = oui;
    performSingleLookup(oui);
    macInput.focus();
  };

  /* -------------------------------------------------------------
     HISTORY & RECENT LOOKUPS
  ------------------------------------------------------------- */
  function loadHistory() {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        lookupHistory = JSON.parse(stored);
      }
    } catch (e) {
      lookupHistory = [];
    }
    renderHistory();
  }

  function addToHistory(mac, vendor) {
    lookupHistory = lookupHistory.filter(item => item.mac !== mac);
    lookupHistory.unshift({ mac, vendor, time: Date.now() });
    if (lookupHistory.length > 12) {
      lookupHistory = lookupHistory.slice(0, 12);
    }
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(lookupHistory));
    } catch (e) { }
    renderHistory();
  }

  function renderHistory() {
    if (!lookupHistory || lookupHistory.length === 0) {
      historyList.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">최근 조회 내역이 없습니다.</span>';
      return;
    }

    historyList.innerHTML = lookupHistory.map(item => `
      <div class="history-tag" data-mac="${item.mac}">
        <span style="font-family: var(--font-mono); font-weight: 600; color: #38bdf8">${item.mac}</span>
        <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #94a3b8;">${escapeHtml(item.vendor)}</span>
      </div>
    `).join('');

    historyList.querySelectorAll('.history-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const mac = tag.dataset.mac;
        macInput.value = mac;
        performSingleLookup(mac, false);
      });
    });
  }

  function clearHistory() {
    lookupHistory = [];
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    showToast('조회 기록이 삭제되었습니다.');
  }

  /* -------------------------------------------------------------
     EVENT HANDLERS & HELPERS
  ------------------------------------------------------------- */
  function bindEvents() {
    // Single Input debounce/type
    macInput.addEventListener('input', () => {
      const val = macInput.value.trim();
      if (val) {
        performSingleLookup(val);
      }
    });

    macInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = macInput.value.trim();
        if (val) performSingleLookup(val, true);
      }
    });

    clearInputBtn.addEventListener('click', () => {
      macInput.value = '';
      macInput.focus();
      singleResultCard.innerHTML = `
        <div class="empty-box">
          <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <p>MAC 주소를 입력하시면 제조사 및 비트 분석 결과가 실시간으로 표시됩니다.</p>
        </div>
      `;
    });

    copyResultBtn.addEventListener('click', () => {
      const textToCopy = macInput.value.trim();
      if (textToCopy) {
        copyToClipboard(textToCopy, '입력된 MAC 주소가 복사되었습니다.');
      }
    });

    // Sample Chips
    sampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sampleMac = chip.dataset.mac;
        macInput.value = sampleMac;
        performSingleLookup(sampleMac, true);
      });
    });

    // Clear history
    clearHistoryBtn.addEventListener('click', clearHistory);

    // Batch actions
    batchAnalyzeBtn.addEventListener('click', performBatchLookup);
    batchClearBtn.addEventListener('click', () => {
      batchInput.value = '';
      batchResultsWrapper.style.display = 'none';
      currentBatchData = [];
    });
    batchExportBtn.addEventListener('click', exportBatchToCSV);
    batchSampleBtn.addEventListener('click', () => {
      batchInput.value = [
        '00:00:0C:4A:2B:10 (Cisco)',
        'F4:D4:88:51:7A:B0 (Apple)',
        '3C:22:FB:A0:12:44 (Samsung)',
        '58-96-1D-00-11-22 (Intel)',
        'B8-27-EB-33-44-55 (Raspberry Pi)',
        '02:1A:11:22:33:44 (Locally Administered / Private)',
        '01:00:5E:00:00:01 (IPv4 Multicast)',
        '286fb9aabbcc (Nokia)',
        '00155d012345 (Microsoft Hyper-V)',
        '000569112233 (VMware)'
      ].join('\n');
      performBatchLookup();
    });

    // Search Vendor Directory
    if (vendorSearchInput) {
      vendorSearchInput.addEventListener('input', (e) => {
        searchVendorDirectory(e.target.value);
      });
    }
  }

  function copyToClipboard(text, msg = '복사되었습니다.') {
    navigator.clipboard.writeText(text).then(() => {
      showToast(msg);
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(msg);
    });
  }

  let toastTimer = null;
  function showToast(message) {
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
