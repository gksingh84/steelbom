// Steel BOM Calculator - Main Application
class SteelBOMCalculator {
    constructor() {
        this.standardSections = [];
        this.iGirders = [];
        this.boxGirders = [];
        this.editingEntry = null;
        this.defaultSteelRate = 65.00; // ₹65.00 per kg (₹65,000 per ton)
        this.storageKey = 'steelBOM_autosave_v1';
        this.initializeEventListeners();
        this.loadSectionData();
        this.setCurrentDate();

        // Restore any autosaved draft from a previous session (before wiring
        // up the project-info autosave listeners so restored values don't
        // immediately re-trigger a save of themselves).
        this.restoreAutosave();
        this.initializeProjectInfoAutosave();

        // Initialize calculated web heights
        this.calculateIWebHeight();
        this.calculateBoxWebHeight();

        // Render whatever was restored (or the empty state)
        this.updateSummaries();
    }

    // ---- Autosave / restore (browser localStorage — per-device, per-browser) ----

    // Snapshot everything needed to fully reconstruct the BOM
    getSnapshot() {
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            projectInfo: {
                projectName: document.getElementById('projectName').value,
                buildingName: document.getElementById('buildingName').value,
                projectDate: document.getElementById('projectDate').value,
                engineer: document.getElementById('engineer').value,
                steelRate: document.getElementById('steelRate').value
            },
            standardSections: this.standardSections,
            iGirders: this.iGirders,
            boxGirders: this.boxGirders
        };
    }

    // Persist current state to localStorage. Called after every add/clear/edit.
    saveAutosave() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.getSnapshot()));
            this.setAutosaveStatus('Draft autosaved in this browser at ' +
                new Date().toLocaleTimeString());
        } catch (e) {
            // localStorage can fail in private-browsing mode or when full —
            // fail silently, the app still works without persistence.
            console.warn('Autosave failed:', e);
            this.setAutosaveStatus('Autosave unavailable in this browser');
        }
    }

    // Restore a previously autosaved draft, if one exists for this browser.
    restoreAutosave() {
        let raw;
        try {
            raw = localStorage.getItem(this.storageKey);
        } catch (e) {
            return; // localStorage inaccessible — nothing to restore
        }
        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            if (data.projectInfo) {
                document.getElementById('projectName').value = data.projectInfo.projectName || '';
                document.getElementById('buildingName').value = data.projectInfo.buildingName || '';
                if (data.projectInfo.projectDate) {
                    document.getElementById('projectDate').value = data.projectInfo.projectDate;
                }
                document.getElementById('engineer').value = data.projectInfo.engineer || '';
                if (data.projectInfo.steelRate) {
                    document.getElementById('steelRate').value = data.projectInfo.steelRate;
                }
            }
            this.standardSections = Array.isArray(data.standardSections) ? data.standardSections : [];
            this.iGirders = Array.isArray(data.iGirders) ? data.iGirders : [];
            this.boxGirders = Array.isArray(data.boxGirders) ? data.boxGirders : [];

        } catch (e) {
            console.warn('Could not restore autosaved draft:', e);
        }
    }

    // Keep project-info fields (name, rate, etc.) autosaving as they're edited
    initializeProjectInfoAutosave() {
        ['projectName', 'buildingName', 'projectDate', 'engineer', 'steelRate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.saveAutosave());
            }
        });
    }

    setAutosaveStatus(text) {
        const el = document.getElementById('autosaveStatus');
        if (el) el.textContent = text;
    }

    // Initialize all event listeners
    initializeEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e));
        });

        document.getElementById('sectionTableBody').addEventListener('click', (e) => {
            this.handleSectionSummaryAction(e);
        });

        ['cancelStandardSectionEdit', 'cancelIGirderEdit', 'cancelBoxGirderEdit'].forEach(id => {
            document.getElementById(id).addEventListener('click', () => this.cancelEntryEdit());
        });

        // Summary tab switching
        document.querySelectorAll('.summary-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchSummaryTab(e));
        });

        // Section type change
        document.getElementById('sectionType').addEventListener('change', (e) => {
            this.updateSectionSizes(e.target.value);
        });

        // I-Section girder input change listeners for real-time calculation
        document.getElementById('totalDepth').addEventListener('input', () => this.calculateIWebHeight());
        document.getElementById('flangeThickness').addEventListener('input', () => this.calculateIWebHeight());

        // Box section girder input change listeners for real-time calculation
        document.getElementById('boxTotalDepth').addEventListener('input', () => this.calculateBoxWebHeight());
        document.getElementById('boxFlangeThickness').addEventListener('input', () => this.calculateBoxWebHeight());

        // Steel rate change listener
        document.getElementById('steelRate').addEventListener('input', () => this.updateTotalSummary());

        // Add buttons
        document.getElementById('addStandardSection').addEventListener('click', () => {
            this.addStandardSection();
        });

        document.getElementById('addIGirder').addEventListener('click', () => {
            this.addIGirder();
        });

        document.getElementById('addBoxGirder').addEventListener('click', () => {
            this.addBoxGirder();
        });

        // Action buttons
        document.getElementById('clearAll').addEventListener('click', () => {
            this.clearAll();
        });

        document.getElementById('exportExcel').addEventListener('click', () => {
            this.exportToExcel();
        });

        document.getElementById('printBOM').addEventListener('click', () => {
            this.printBOM();
        });
    }

    // Set current date
    setCurrentDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('projectDate').value = today;
    }

    // Switch between main tabs
    switchTab(e) {
        const targetTab = e.currentTarget.dataset.tab;

        if (this.editingEntry && this.getEntryFormConfig(this.editingEntry.collection).tab !== targetTab) {
            this.cancelEntryEdit();
        }
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(targetTab).classList.add('active');
    }

    // Switch between summary tabs
    switchSummaryTab(e) {
        const targetSummary = e.target.dataset.summary;
        
        // Update summary tab buttons
        document.querySelectorAll('.summary-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');

        // Update summary content
        document.querySelectorAll('.summary-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${targetSummary}-summary`).classList.add('active');
    }

    // Source tables: 2.1 (ISMB), 2.2 (ISJB/ISLB/ISWB), 3.1 (ISHB), 4.1 (ISMC/ISLC), 5.1 (ISA equal), 6.1 (ISA unequal).
    // NOTE: previous version of this database contained multiple errors verified against the standard:
    //  - ISJB previously listed 10 fabricated sizes; only 4 sizes actually exist in IS 808 (150/175/200/225).
    //  - ISWB, ISLB and ISLC weights were substantially wrong for most sizes (not just rounding).
    //  - "ISHP" is not a real IS 808 designation — the correct designation is ISHB (Heavy Weight Beam/Column).
    //  - Several ISA/ISA-unequal size+thickness combinations did not exist in the standard at all.
    loadSectionData() {
        this.sectionDatabase = {
            'ISMB': {
                'ISMB 100': { weight: 8.9, depth: 100, width: 50 },
                'ISMB 125': { weight: 13.3, depth: 125, width: 70 },
                'ISMB 150': { weight: 15.0, depth: 150, width: 75 },
                'ISMB 175': { weight: 19.6, depth: 175, width: 85 },
                'ISMB 200': { weight: 24.2, depth: 200, width: 100 },
                'ISMB 225': { weight: 31.1, depth: 225, width: 110 },
                'ISMB 250': { weight: 37.3, depth: 250, width: 125 },
                'ISMB 300': { weight: 46.0, depth: 300, width: 140 },
                'ISMB 350': { weight: 52.4, depth: 350, width: 140 },
                'ISMB 400': { weight: 61.5, depth: 400, width: 140 },
                'ISMB 450': { weight: 72.4, depth: 450, width: 150 },
                'ISMB 500': { weight: 86.9, depth: 500, width: 180 },
                'ISMB 550': { weight: 104.0, depth: 550, width: 190 },
                'ISMB 600': { weight: 123.0, depth: 600, width: 210 }
            },
            'ISJB': {
                // Only these 4 sizes exist in IS 808:1989 — do not add more.
                'ISJB 150': { weight: 7.1, depth: 150, width: 50 },
                'ISJB 175': { weight: 8.1, depth: 175, width: 50 },
                'ISJB 200': { weight: 9.9, depth: 200, width: 60 },
                'ISJB 225': { weight: 12.8, depth: 225, width: 80 }
            },
            'ISLB': {
                'ISLB 75': { weight: 6.1, depth: 75, width: 50 },
                'ISLB 100': { weight: 8.0, depth: 100, width: 50 },
                'ISLB 125': { weight: 11.9, depth: 125, width: 75 },
                'ISLB 150': { weight: 14.2, depth: 150, width: 80 },
                'ISLB 175': { weight: 16.7, depth: 175, width: 90 },
                'ISLB 200': { weight: 19.8, depth: 200, width: 100 },
                'ISLB 225': { weight: 23.5, depth: 225, width: 100 },
                'ISLB 250': { weight: 27.9, depth: 250, width: 125 },
                'ISLB 275': { weight: 33.0, depth: 275, width: 140 },
                'ISLB 300': { weight: 37.7, depth: 300, width: 150 },
                'ISLB 325': { weight: 43.1, depth: 325, width: 165 },
                'ISLB 350': { weight: 49.5, depth: 350, width: 165 },
                'ISLB 400': { weight: 56.9, depth: 400, width: 165 },
                'ISLB 450': { weight: 65.3, depth: 450, width: 170 },
                'ISLB 500': { weight: 75.0, depth: 500, width: 180 },
                'ISLB 550': { weight: 86.3, depth: 550, width: 190 },
                'ISLB 600': { weight: 99.5, depth: 600, width: 210 }
            },
            'ISWB': {
                'ISWB 150': { weight: 17.0, depth: 150, width: 100 },
                'ISWB 175': { weight: 22.1, depth: 175, width: 125 },
                'ISWB 200': { weight: 28.8, depth: 200, width: 140 },
                'ISWB 225': { weight: 33.9, depth: 225, width: 150 },
                'ISWB 250': { weight: 40.9, depth: 250, width: 200 },
                'ISWB 300': { weight: 48.1, depth: 300, width: 200 },
                'ISWB 350': { weight: 56.9, depth: 350, width: 200 },
                'ISWB 400': { weight: 66.7, depth: 400, width: 200 },
                'ISWB 450': { weight: 79.4, depth: 450, width: 200 },
                'ISWB 500': { weight: 95.2, depth: 500, width: 250 },
                'ISWB 550': { weight: 112.0, depth: 550, width: 250 },
                'ISWB 600': { weight: 134.0, depth: 600, width: 250 }
            },
            'ISHB': {
                // Heavy Weight Beam/Column — correct designation (previously mislabeled "ISHP" in this tool).
                'ISHB 150': { weight: 27.1, depth: 150, width: 150 },
                'ISHB 200': { weight: 37.3, depth: 200, width: 200 },
                'ISHB 225': { weight: 43.1, depth: 225, width: 225 },
                'ISHB 250': { weight: 51.0, depth: 250, width: 250 },
                'ISHB 300': { weight: 58.8, depth: 300, width: 250 },
                'ISHB 350': { weight: 67.4, depth: 350, width: 250 },
                'ISHB 400': { weight: 77.4, depth: 400, width: 250 },
                'ISHB 450': { weight: 87.2, depth: 450, width: 250 }
            },
            'ISMC': {
                'ISMC 75': { weight: 7.14, depth: 75, width: 40 },
                'ISMC 100': { weight: 9.56, depth: 100, width: 50 },
                'ISMC 125': { weight: 13.1, depth: 125, width: 65 },
                'ISMC 150': { weight: 16.8, depth: 150, width: 75 },
                'ISMC 175': { weight: 19.6, depth: 175, width: 75 },
                'ISMC 200': { weight: 22.3, depth: 200, width: 75 },
                'ISMC 225': { weight: 26.1, depth: 225, width: 80 },
                'ISMC 250': { weight: 30.6, depth: 250, width: 80 },
                'ISMC 300': { weight: 36.3, depth: 300, width: 90 },
                'ISMC 350': { weight: 42.7, depth: 350, width: 100 },
                'ISMC 400': { weight: 50.1, depth: 400, width: 100 }
            },
            'ISLC': {
                'ISLC 75': { weight: 5.7, depth: 75, width: 40 },
                'ISLC 100': { weight: 7.9, depth: 100, width: 50 },
                'ISLC 125': { weight: 10.7, depth: 125, width: 65 },
                'ISLC 150': { weight: 14.4, depth: 150, width: 75 },
                'ISLC 175': { weight: 17.6, depth: 175, width: 75 },
                'ISLC 200': { weight: 20.6, depth: 200, width: 75 },
                'ISLC 225': { weight: 24.0, depth: 225, width: 90 },
                'ISLC 250': { weight: 28.0, depth: 250, width: 100 },
                'ISLC 300': { weight: 33.1, depth: 300, width: 100 },
                'ISLC 350': { weight: 38.9, depth: 350, width: 100 },
                'ISLC 400': { weight: 45.8, depth: 400, width: 100 }
            },
            'RHS': {
                '50 x 25 x 2.0': { weight: 2.6, depth: 50, width: 25 },
                '50 x 25 x 3.0': { weight: 3.6, depth: 50, width: 25 },
                '60 x 40 x 2.5': { weight: 4.0, depth: 60, width: 40 },
                '80 x 40 x 2.5': { weight: 5.0, depth: 80, width: 40 },
                '100 x 50 x 3.0': { weight: 7.5, depth: 100, width: 50 },
                '120 x 60 x 3.0': { weight: 8.8, depth: 120, width: 60 },
                '150 x 100 x 4.0': { weight: 14.0, depth: 150, width: 100 },
                '200 x 100 x 4.0': { weight: 17.0, depth: 200, width: 100 },
                '200 x 150 x 4.0': { weight: 19.0, depth: 200, width: 150 }
            },
            'CHS': {
                '21.3 x 2.0': { weight: 1.2, depth: 21.3, width: 21.3 },
                '26.9 x 2.3': { weight: 1.6, depth: 26.9, width: 26.9 },
                '33.7 x 2.6': { weight: 2.1, depth: 33.7, width: 33.7 },
                '42.4 x 2.6': { weight: 2.9, depth: 42.4, width: 42.4 },
                '48.3 x 2.9': { weight: 3.7, depth: 48.3, width: 48.3 },
                '60.3 x 3.2': { weight: 5.0, depth: 60.3, width: 60.3 },
                '76.1 x 3.6': { weight: 7.2, depth: 76.1, width: 76.1 },
                '88.9 x 4.0': { weight: 9.0, depth: 88.9, width: 88.9 },
                '114.3 x 4.5': { weight: 13.4, depth: 114.3, width: 114.3 },
                '139.7 x 5.0': { weight: 18.6, depth: 139.7, width: 139.7 }
            },
            'SHS': {
                '25 x 25 x 2.0': { weight: 1.5, depth: 25, width: 25 },
                '30 x 30 x 2.0': { weight: 1.8, depth: 30, width: 30 },
                '40 x 40 x 2.5': { weight: 2.8, depth: 40, width: 40 },
                '50 x 50 x 2.5': { weight: 3.6, depth: 50, width: 50 },
                '60 x 60 x 3.0': { weight: 5.2, depth: 60, width: 60 },
                '80 x 80 x 3.0': { weight: 7.2, depth: 80, width: 80 },
                '100 x 100 x 3.0': { weight: 9.3, depth: 100, width: 100 },
                '120 x 120 x 4.0': { weight: 14.3, depth: 120, width: 120 },
                '150 x 150 x 4.0': { weight: 18.8, depth: 150, width: 150 },
                '200 x 200 x 5.0': { weight: 30.0, depth: 200, width: 200 }
            },
            'NPB': {
                'NPB 100x55x8.10': { weight: 8.10, depth: 100, width: 55 },
                'NPB 120x60x10.37': { weight: 10.37, depth: 120, width: 60 },
                'NPB 140x70x12.89': { weight: 12.89, depth: 140, width: 70 },
                'NPB 160x80x15.77': { weight: 15.77, depth: 160, width: 80 },
                'NPB 180x90x15.37': { weight: 15.37, depth: 180, width: 90 },
                'NPB 180x90x18.80': { weight: 18.80, depth: 180, width: 90 },
                'NPB 180x90x21.27': { weight: 21.27, depth: 180, width: 90 },
                'NPB 200x100x18.42': { weight: 18.42, depth: 200, width: 100 },
                'NPB 200x100x22.36': { weight: 22.36, depth: 200, width: 100 },
                'NPB 200x100x25.09': { weight: 25.09, depth: 200, width: 100 },
                'NPB 200x130x27.37': { weight: 27.37, depth: 200, width: 130 },
                'NPB 200x130x31.55': { weight: 31.55, depth: 200, width: 130 },
                'NPB 200x150x30.45': { weight: 30.45, depth: 200, width: 150 },
                'NPB 200x165x35.68': { weight: 35.68, depth: 200, width: 165 },
                'NPB 200x165x42.47': { weight: 42.47, depth: 200, width: 165 },
                'NPB 200x165x48.00': { weight: 48.00, depth: 200, width: 165 },
                'NPB 220x110x22.18': { weight: 22.18, depth: 220, width: 110 },
                'NPB 220x110x26.20': { weight: 26.20, depth: 220, width: 110 },
                'NPB 220x110x29.35': { weight: 29.35, depth: 220, width: 110 },
                'NPB 240x120x26.15': { weight: 26.15, depth: 240, width: 120 },
                'NPB 240x120x30.71': { weight: 30.71, depth: 240, width: 120 },
                'NPB 240x120x34.31': { weight: 34.31, depth: 240, width: 120 },
                'NPB 250x125x30.11': { weight: 30.11, depth: 250, width: 125 },
                'NPB 250x150x34.08': { weight: 34.08, depth: 250, width: 150 },
                'NPB 250x150x39.78': { weight: 39.78, depth: 250, width: 150 },
                'NPB 250x150x46.48': { weight: 46.48, depth: 250, width: 150 },
                'NPB 250x175x43.94': { weight: 43.94, depth: 250, width: 175 },
                'NPB 270x135x30.73': { weight: 30.73, depth: 270, width: 135 },
                'NPB 270x135x36.07': { weight: 36.07, depth: 270, width: 135 },
                'NPB 270x135x42.26': { weight: 42.26, depth: 270, width: 135 },
                'NPB 300x150x36.52': { weight: 36.52, depth: 300, width: 150 },
                'NPB 300x150x42.24': { weight: 42.24, depth: 300, width: 150 },
                'NPB 300x150x49.32': { weight: 49.32, depth: 300, width: 150 },
                'NPB 300x165x39.88': { weight: 39.88, depth: 300, width: 165 },
                'NPB 300x165x45.76': { weight: 45.76, depth: 300, width: 165 },
                'NPB 300x165x53.46': { weight: 53.46, depth: 300, width: 165 },
                'NPB 300x200x59.56': { weight: 59.56, depth: 300, width: 200 },
                'NPB 300x200x66.75': { weight: 66.75, depth: 300, width: 200 },
                'NPB 300x200x75.37': { weight: 75.37, depth: 300, width: 200 },
                'NPB 330x160x42.97': { weight: 42.97, depth: 330, width: 160 },
                'NPB 330x160x49.15': { weight: 49.15, depth: 330, width: 160 },
                'NPB 330x160x57.00': { weight: 57.00, depth: 330, width: 160 },
                'NPB 350x170x50.21': { weight: 50.21, depth: 350, width: 170 },
                'NPB 350x170x57.09': { weight: 57.09, depth: 350, width: 170 },
                'NPB 350x170x66.04': { weight: 66.04, depth: 350, width: 170 },
                'NPB 350x250x79.18': { weight: 79.18, depth: 350, width: 250 },
                'NPB 400x180x57.38': { weight: 57.38, depth: 400, width: 180 },
                'NPB 400x180x66.30': { weight: 66.30, depth: 400, width: 180 },
                'NPB 400x180x75.66': { weight: 75.66, depth: 400, width: 180 },
                'NPB 400x200x67.28': { weight: 67.28, depth: 400, width: 200 },
                'NPB 450x190x67.15': { weight: 67.15, depth: 450, width: 190 },
                'NPB 450x190x77.57': { weight: 77.57, depth: 450, width: 190 },
                'NPB 450x190x92.36': { weight: 92.36, depth: 450, width: 190 },
                'NPB 500x200x79.36': { weight: 79.36, depth: 500, width: 200 },
                'NPB 500x200x90.68': { weight: 90.68, depth: 500, width: 200 },
                'NPB 500x200x107.31': { weight: 107.31, depth: 500, width: 200 },
                'NPB 550x210x92.07': { weight: 92.07, depth: 550, width: 210 },
                'NPB 550x210x105.52': { weight: 105.52, depth: 550, width: 210 },
                'NPB 550x210x122.52': { weight: 122.52, depth: 550, width: 210 },
                'NPB 600x220x107.56': { weight: 107.56, depth: 600, width: 220 },
                'NPB 600x220x122.45': { weight: 122.45, depth: 600, width: 220 },
                'NPB 600x220x154.46': { weight: 154.46, depth: 600, width: 220 },
                'NPB 700x250x113.45': { weight: 113.45, depth: 700, width: 250 },
                'NPB 700x250x128.41': { weight: 128.41, depth: 700, width: 250 },
                'NPB 700x250x143.42': { weight: 143.42, depth: 700, width: 250 },
                'NPB 700x250x153.86': { weight: 153.86, depth: 700, width: 250 },
                'NPB 700x250x171.47': { weight: 171.47, depth: 700, width: 250 },
                'NPB 750x270x145.29': { weight: 145.29, depth: 750, width: 270 },
                'NPB 750x270x174.54': { weight: 174.54, depth: 750, width: 270 },
                'NPB 750x270x202.48': { weight: 202.48, depth: 750, width: 270 }
            },
            'WPB': {
                'WPB 100x100x12.24': { weight: 12.24, depth: 100, width: 100 },
                'WPB 100x100x16.67': { weight: 16.67, depth: 100, width: 100 },
                'WPB 100x100x20.44': { weight: 20.44, depth: 100, width: 100 },
                'WPB 100x100x41.79': { weight: 41.79, depth: 100, width: 100 },
                'WPB 120x120x14.56': { weight: 14.56, depth: 120, width: 120 },
                'WPB 120x120x19.89': { weight: 19.89, depth: 120, width: 120 },
                'WPB 120x120x26.69': { weight: 26.69, depth: 120, width: 120 },
                'WPB 120x120x52.13': { weight: 52.13, depth: 120, width: 120 },
                'WPB 140x140x18.07': { weight: 18.07, depth: 140, width: 140 },
                'WPB 140x140x24.66': { weight: 24.66, depth: 140, width: 140 },
                'WPB 140x140x33.72': { weight: 33.72, depth: 140, width: 140 },
                'WPB 140x140x63.24': { weight: 63.24, depth: 140, width: 140 },
                'WPB 150x150x22.96': { weight: 22.96, depth: 150, width: 150 },
                'WPB 150x150x30.04': { weight: 30.04, depth: 150, width: 150 },
                'WPB 150x150x36.98': { weight: 36.98, depth: 150, width: 150 },
                'WPB 160x160x23.83': { weight: 23.83, depth: 160, width: 160 },
                'WPB 160x160x30.44': { weight: 30.44, depth: 160, width: 160 },
                'WPB 160x160x42.59': { weight: 42.59, depth: 160, width: 160 },
                'WPB 160x160x76.19': { weight: 76.19, depth: 160, width: 160 },
                'WPB 180x180x28.68': { weight: 28.68, depth: 180, width: 180 },
                'WPB 180x180x35.52': { weight: 35.52, depth: 180, width: 180 },
                'WPB 180x180x51.22': { weight: 51.22, depth: 180, width: 180 },
                'WPB 180x180x88.90': { weight: 88.90, depth: 180, width: 180 },
                'WPB 200x200x34.64': { weight: 34.64, depth: 200, width: 200 },
                'WPB 200x200x42.26': { weight: 42.26, depth: 200, width: 200 },
                'WPB 200x200x50.92': { weight: 50.92, depth: 200, width: 200 },
                'WPB 200x200x61.29': { weight: 61.29, depth: 200, width: 200 },
                'WPB 200x200x74.01': { weight: 74.01, depth: 200, width: 200 },
                'WPB 200x200x83.52': { weight: 83.52, depth: 200, width: 200 },
                'WPB 200x200x103.06': { weight: 103.06, depth: 200, width: 200 },
                'WPB 220x220x40.40': { weight: 40.40, depth: 220, width: 220 },
                'WPB 220x220x50.51': { weight: 50.51, depth: 220, width: 220 },
                'WPB 220x220x71.47': { weight: 71.47, depth: 220, width: 220 },
                'WPB 220x220x117.31': { weight: 117.31, depth: 220, width: 220 },
                'WPB 240x240x47.39': { weight: 47.39, depth: 240, width: 240 },
                'WPB 240x240x60.32': { weight: 60.32, depth: 240, width: 240 },
                'WPB 240x240x83.20': { weight: 83.20, depth: 240, width: 240 },
                'WPB 240x240x156.67': { weight: 156.67, depth: 240, width: 240 },
                'WPB 250x250x67.21': { weight: 67.21, depth: 250, width: 250 },
                'WPB 250x250x73.14': { weight: 73.14, depth: 250, width: 250 },
                'WPB 250x250x85.04': { weight: 85.04, depth: 250, width: 250 },
                'WPB 250x250x97.03': { weight: 97.03, depth: 250, width: 250 },
                'WPB 250x250x103.97': { weight: 103.97, depth: 250, width: 250 },
                'WPB 250x250x117.57': { weight: 117.57, depth: 250, width: 250 },
                'WPB 250x250x133.91': { weight: 133.91, depth: 250, width: 250 },
                'WPB 250x250x148.37': { weight: 148.37, depth: 250, width: 250 },
                'WPB 260x260x54.14': { weight: 54.14, depth: 260, width: 260 },
                'WPB 260x260x68.15': { weight: 68.15, depth: 260, width: 260 },
                'WPB 260x260x92.98': { weight: 92.98, depth: 260, width: 260 },
                'WPB 260x260x114.40': { weight: 114.40, depth: 260, width: 260 },
                'WPB 260x260x141.51': { weight: 141.51, depth: 260, width: 260 },
                'WPB 260x260x172.42': { weight: 172.42, depth: 260, width: 260 },
                'WPB 280x280x61.25': { weight: 61.25, depth: 280, width: 280 },
                'WPB 280x280x76.35': { weight: 76.35, depth: 280, width: 280 },
                'WPB 280x280x188.53': { weight: 188.53, depth: 280, width: 280 },
                'WPB 280x280x284.13': { weight: 284.13, depth: 280, width: 280 },
                'WPB 300x300x69.79': { weight: 69.79, depth: 300, width: 300 },
                'WPB 300x300x88.33': { weight: 88.33, depth: 300, width: 300 },
                'WPB 300x300x100.84': { weight: 100.84, depth: 300, width: 300 },
                'WPB 300x300x117.03': { weight: 117.03, depth: 300, width: 300 },
                'WPB 300x300x237.92': { weight: 237.92, depth: 300, width: 300 },
                'WPB 320x300x74.24': { weight: 74.24, depth: 320, width: 300 },
                'WPB 320x300x97.63': { weight: 97.63, depth: 320, width: 300 },
                'WPB 320x300x126.65': { weight: 126.65, depth: 320, width: 300 },
                'WPB 320x300x244.96': { weight: 244.96, depth: 320, width: 300 },
                'WPB 340x300x78.89': { weight: 78.89, depth: 340, width: 300 },
                'WPB 340x300x104.78': { weight: 104.78, depth: 340, width: 300 },
                'WPB 340x300x134.15': { weight: 134.15, depth: 340, width: 300 },
                'WPB 340x300x247.92': { weight: 247.92, depth: 340, width: 300 },
                'WPB 360x300x83.69': { weight: 83.69, depth: 360, width: 300 },
                'WPB 360x300x112.06': { weight: 112.06, depth: 360, width: 300 },
                'WPB 360x300x141.80': { weight: 141.80, depth: 360, width: 300 },
                'WPB 360x300x250.26': { weight: 250.26, depth: 360, width: 300 },
                'WPB 360x370x136.20': { weight: 136.20, depth: 360, width: 370 },
                'WPB 360x370x150.87': { weight: 150.87, depth: 360, width: 370 },
                'WPB 360x370x165.34': { weight: 165.34, depth: 360, width: 370 },
                'WPB 360x370x182.01': { weight: 182.01, depth: 360, width: 370 },
                'WPB 360x370x197.65': { weight: 197.65, depth: 360, width: 370 },
                'WPB 400x300x92.39': { weight: 92.39, depth: 400, width: 300 },
                'WPB 400x300x124.80': { weight: 124.80, depth: 400, width: 300 },
                'WPB 400x300x155.26': { weight: 155.26, depth: 400, width: 300 },
                'WPB 400x300x255.74': { weight: 255.74, depth: 400, width: 300 },
                'WPB 400x400x191.10': { weight: 191.10, depth: 400, width: 400 },
                'WPB 400x400x219.66': { weight: 219.66, depth: 400, width: 400 },
                'WPB 400x400x239.62': { weight: 239.62, depth: 400, width: 400 },
                'WPB 450x300x99.74': { weight: 99.74, depth: 450, width: 300 },
                'WPB 450x300x139.75': { weight: 139.75, depth: 450, width: 300 },
                'WPB 450x300x171.11': { weight: 171.11, depth: 450, width: 300 },
                'WPB 450x300x263.32': { weight: 263.32, depth: 450, width: 300 },
                'WPB 500x300x107.45': { weight: 107.45, depth: 500, width: 300 },
                'WPB 500x300x129.77': { weight: 129.77, depth: 500, width: 300 },
                'WPB 500x300x155.07': { weight: 155.07, depth: 500, width: 300 },
                'WPB 500x300x187.33': { weight: 187.33, depth: 500, width: 300 },
                'WPB 500x300x270.27': { weight: 270.27, depth: 500, width: 300 },
                'WPB 550x300x119.98': { weight: 119.98, depth: 550, width: 300 },
                'WPB 550x300x166.23': { weight: 166.23, depth: 550, width: 300 },
                'WPB 550x300x199.44': { weight: 199.44, depth: 550, width: 300 },
                'WPB 550x300x278.19': { weight: 278.19, depth: 550, width: 300 },
                'WPB 600x300x128.79': { weight: 128.79, depth: 600, width: 300 },
                'WPB 600x300x177.77': { weight: 177.77, depth: 600, width: 300 },
                'WPB 600x300x211.92': { weight: 211.92, depth: 600, width: 300 },
                'WPB 600x300x285.47': { weight: 285.47, depth: 600, width: 300 },
                'WPB 650x300x137.97': { weight: 137.97, depth: 650, width: 300 },
                'WPB 650x300x189.69': { weight: 189.69, depth: 650, width: 300 },
                'WPB 650x300x224.78': { weight: 224.78, depth: 650, width: 300 },
                'WPB 650x300x293.38': { weight: 293.38, depth: 650, width: 300 },
                'WPB 700x300x149.89': { weight: 149.89, depth: 700, width: 300 },
                'WPB 700x300x204.48': { weight: 204.48, depth: 700, width: 300 },
                'WPB 700x300x240.51': { weight: 240.51, depth: 700, width: 300 },
                'WPB 700x300x300.67': { weight: 300.67, depth: 700, width: 300 },
                'WPB 800x300x171.51': { weight: 171.51, depth: 800, width: 300 },
                'WPB 800x300x224.37': { weight: 224.37, depth: 800, width: 300 },
                'WPB 800x300x262.33': { weight: 262.33, depth: 800, width: 300 },
                'WPB 800x300x317.35': { weight: 317.35, depth: 800, width: 300 },
                'WPB 850x300x179.89': { weight: 179.89, depth: 850, width: 300 },
                'WPB 850x300x195.73': { weight: 195.73, depth: 850, width: 300 },
                'WPB 850x300x214.24': { weight: 214.24, depth: 850, width: 300 },
                'WPB 850x300x230.55': { weight: 230.55, depth: 850, width: 300 },
                'WPB 850x300x253.68': { weight: 253.68, depth: 850, width: 300 },
                'WPB 900x300x198.00': { weight: 198.00, depth: 900, width: 300 },
                'WPB 900x300x251.61': { weight: 251.61, depth: 900, width: 300 },
                'WPB 900x300x291.45': { weight: 291.45, depth: 900, width: 300 }
            },
            'ISA': {
                '20 x 20 x 3': { weight: 0.91, depth: 20, width: 20 },
                '25 x 25 x 3': { weight: 1.1, depth: 25, width: 25 },
                '30 x 30 x 3': { weight: 1.4, depth: 30, width: 30 },
                '35 x 35 x 3': { weight: 1.6, depth: 35, width: 35 },
                '40 x 40 x 3': { weight: 1.8, depth: 40, width: 40 },
                '45 x 45 x 4': { weight: 2.7, depth: 45, width: 45 },
                '50 x 50 x 4': { weight: 3.0, depth: 50, width: 50 },
                '55 x 55 x 4': { weight: 3.3, depth: 55, width: 55 },
                '60 x 60 x 4': { weight: 3.7, depth: 60, width: 60 },
                '65 x 65 x 5': { weight: 4.9, depth: 65, width: 65 },
                '70 x 70 x 5': { weight: 5.3, depth: 70, width: 70 },
                '75 x 75 x 5': { weight: 5.7, depth: 75, width: 75 },
                '80 x 80 x 6': { weight: 7.3, depth: 80, width: 80 },
                '90 x 90 x 6': { weight: 8.2, depth: 90, width: 90 },
                '100 x 100 x 6': { weight: 9.2, depth: 100, width: 100 },
                '110 x 110 x 8': { weight: 13.4, depth: 110, width: 110 },
                '130 x 130 x 8': { weight: 15.9, depth: 130, width: 130 },
                '150 x 150 x 10': { weight: 22.9, depth: 150, width: 150 },
                '180 x 180 x 15': { weight: 40.9, depth: 180, width: 180 },
                '200 x 200 x 12': { weight: 36.9, depth: 200, width: 200 }
            },
            'ISA-unequal': {
                '30 x 20 x 3': { weight: 1.1, depth: 30, width: 20 },
                '40 x 25 x 3': { weight: 1.5, depth: 40, width: 25 },
                '45 x 30 x 3': { weight: 1.7, depth: 45, width: 30 },
                '50 x 30 x 4': { weight: 2.4, depth: 50, width: 30 },
                '60 x 40 x 5': { weight: 3.7, depth: 60, width: 40 },
                '65 x 45 x 5': { weight: 4.1, depth: 65, width: 45 },
                '70 x 45 x 5': { weight: 4.3, depth: 70, width: 45 },
                '75 x 50 x 5': { weight: 4.7, depth: 75, width: 50 },
                '80 x 50 x 5': { weight: 4.9, depth: 80, width: 50 },
                '90 x 60 x 6': { weight: 6.8, depth: 90, width: 60 },
                '100 x 65 x 6': { weight: 7.5, depth: 100, width: 65 },
                '100 x 75 x 6': { weight: 8.0, depth: 100, width: 75 },
                '125 x 75 x 6': { weight: 9.2, depth: 125, width: 75 },
                '125 x 95 x 6': { weight: 10.1, depth: 125, width: 95 },
                '150 x 75 x 8': { weight: 13.7, depth: 150, width: 75 },
                '150 x 115 x 8': { weight: 16.3, depth: 150, width: 115 },
                '200 x 100 x 10': { weight: 22.9, depth: 200, width: 100 },
                '200 x 150 x 10': { weight: 26.9, depth: 200, width: 150 }
            }
        };
    }

    getStandardSectionDisplayName(sectionType, sectionSize, sectionData) {
        if (sectionType === 'NPB' || sectionType === 'WPB') {
            return `${sectionType} ${sectionData.depth}X${sectionData.width}X${sectionData.weight.toFixed(2)}`;
        }

        return sectionSize;
    }

    getBomSectionLabel(baseName, plates) {
        const addedPlateLabels = (plates || [])
            .filter(plate => plate.type.indexOf('Additional') === 0)
            .map(plate => {
                const plateWidth = plate.dimensions.split(' x ')[0];
                const plateType = plate.type.indexOf('Top Flange') >= 0 ? 'TOP FLG' :
                    plate.type.indexOf('Bottom Flange') >= 0 ? 'BOTTOM FLG' :
                    plate.type.indexOf('Flange') >= 0 ? 'FLG' : 'WEB';
                return `${plateWidth}X${plate.thickness} ${plateType} PLT`;
            });

        return [baseName, ...addedPlateLabels].join(' + ');
    }

    formatGirderSize(totalDepth, flangeWidth, flangeThickness, webThickness) {
        return `${totalDepth}X${flangeWidth}X${flangeThickness}X${webThickness}`;
    }

    getGirderSize(girder) {
        return girder.size || this.formatGirderSize(
            girder.totalDepth,
            girder.flangeWidth ?? girder.width,
            girder.flangeThickness,
            girder.webThickness
        );
    }

    // Update section sizes based on selected type
    updateSectionSizes(sectionType) {
        const sizeSelect = document.getElementById('sectionSize');
        sizeSelect.innerHTML = '<option value="">Select Size</option>';
        sizeSelect.disabled = true;

        if (sectionType && this.sectionDatabase[sectionType]) {
            sizeSelect.disabled = false;
            Object.keys(this.sectionDatabase[sectionType]).forEach(size => {
                const option = document.createElement('option');
                const sectionData = this.sectionDatabase[sectionType][size];
                option.value = size;
                option.textContent = this.getStandardSectionDisplayName(sectionType, size, sectionData);
                sizeSelect.appendChild(option);
            });
        }
    }

    getEntryFormConfig(collection) {
        return {
            standardSections: { tab: 'standard', buttonId: 'addStandardSection', cancelId: 'cancelStandardSectionEdit', label: 'Add Section', updateLabel: 'Update Section' },
            iGirders: { tab: 'i-girder', buttonId: 'addIGirder', cancelId: 'cancelIGirderEdit', label: 'Add I-Section Girder', updateLabel: 'Update I-Section Girder' },
            boxGirders: { tab: 'box-girder', buttonId: 'addBoxGirder', cancelId: 'cancelBoxGirderEdit', label: 'Add Box Section Girder', updateLabel: 'Update Box Section Girder' }
        }[collection];
    }

    setEntryFormMode(collection, isEditing) {
        const config = this.getEntryFormConfig(collection);
        const button = document.getElementById(config.buttonId);
        button.innerHTML = `<i class="fas fa-${isEditing ? 'save' : 'plus'}"></i> ${isEditing ? config.updateLabel : config.label}`;
        document.getElementById(config.cancelId).style.display = isEditing ? 'inline-flex' : 'none';
    }

    saveEntry(collection, entry) {
        if (this.editingEntry && this.editingEntry.collection === collection) {
            const { index, id } = this.editingEntry;
            entry.id = id;
            this[collection][index] = entry;
            this.editingEntry = null;
            this.setEntryFormMode(collection, false);
            return true;
        }

        this[collection].push(entry);
        return false;
    }

    getAdditionalPlateValues(plates) {
        const values = {
            webWidth: '', webThickness: '',
            topWidth: '', topThickness: '',
            bottomWidth: '', bottomThickness: ''
        };
        const setPlateValues = (plate, widthKey, thicknessKey) => {
            values[widthKey] = plate.dimensions.split(' x ')[0];
            values[thicknessKey] = plate.thickness;
        };

        (plates || []).forEach(plate => {
            if (plate.type.indexOf('Additional Web Plate') === 0) {
                setPlateValues(plate, 'webWidth', 'webThickness');
            } else if (plate.type === 'Additional Flange Plate' || plate.type.indexOf('Additional Flange Plate (') === 0) {
                setPlateValues(plate, 'topWidth', 'topThickness');
                setPlateValues(plate, 'bottomWidth', 'bottomThickness');
            } else if (plate.type === 'Additional Top Flange Plate') {
                setPlateValues(plate, 'topWidth', 'topThickness');
            } else if (plate.type === 'Additional Bottom Flange Plate') {
                setPlateValues(plate, 'bottomWidth', 'bottomThickness');
            }
        });

        return values;
    }

    setFormValues(values) {
        Object.entries(values).forEach(([id, value]) => {
            document.getElementById(id).value = value ?? '';
        });
    }

    beginEntryEdit(collection, index) {
        const entry = this[collection][index];
        if (!entry) return;

        if (this.editingEntry) this.cancelEntryEdit();

        const config = this.getEntryFormConfig(collection);
        document.querySelector(`.tab-btn[data-tab="${config.tab}"]`).click();
        const plates = this.getAdditionalPlateValues(entry.plates);

        if (collection === 'standardSections') {
            document.getElementById('sectionType').value = entry.type;
            this.updateSectionSizes(entry.type);
            const sizeKey = Object.keys(this.sectionDatabase[entry.type] || {}).find(size => {
                const data = this.sectionDatabase[entry.type][size];
                return this.getStandardSectionDisplayName(entry.type, size, data) === entry.size;
            }) || entry.size;
            document.getElementById('sectionSize').value = sizeKey;
            this.setFormValues({
                quantity: entry.quantity,
                length: entry.length,
                additionalWebPlateWidth: plates.webWidth,
                additionalWebPlateThickness: plates.webThickness,
                additionalTopFlangePlateWidth: plates.topWidth,
                additionalTopFlangePlateThickness: plates.topThickness,
                additionalBottomFlangePlateWidth: plates.bottomWidth,
                additionalBottomFlangePlateThickness: plates.bottomThickness
            });
        } else if (collection === 'iGirders') {
            this.setFormValues({
                girderLength: entry.length,
                totalDepth: entry.totalDepth,
                flangeWidth: entry.flangeWidth,
                flangeThickness: entry.flangeThickness,
                webThickness: entry.webThickness,
                iAdditionalWebPlateWidth: plates.webWidth,
                iAdditionalWebPlateThickness: plates.webThickness,
                iAdditionalTopFlangePlateWidth: plates.topWidth,
                iAdditionalTopFlangePlateThickness: plates.topThickness,
                iAdditionalBottomFlangePlateWidth: plates.bottomWidth,
                iAdditionalBottomFlangePlateThickness: plates.bottomThickness
            });
            this.calculateIWebHeight();
        } else {
            this.setFormValues({
                boxGirderLength: entry.length,
                boxTotalDepth: entry.totalDepth,
                boxWidth: entry.width,
                boxFlangeThickness: entry.flangeThickness,
                boxWebThickness: entry.webThickness,
                boxAdditionalWebPlateWidth: plates.webWidth,
                boxAdditionalWebPlateThickness: plates.webThickness,
                boxAdditionalTopFlangePlateWidth: plates.topWidth,
                boxAdditionalTopFlangePlateThickness: plates.topThickness,
                boxAdditionalBottomFlangePlateWidth: plates.bottomWidth,
                boxAdditionalBottomFlangePlateThickness: plates.bottomThickness
            });
            this.calculateBoxWebHeight();
        }

        this.editingEntry = { collection, index, id: entry.id };
        this.setEntryFormMode(collection, true);
        document.getElementById(config.buttonId).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    cancelEntryEdit() {
        if (!this.editingEntry) return;

        const collection = this.editingEntry.collection;
        this.editingEntry = null;
        if (collection === 'standardSections') this.clearStandardSectionForm();
        if (collection === 'iGirders') this.clearIGirderForm();
        if (collection === 'boxGirders') this.clearBoxGirderForm();
        this.setEntryFormMode(collection, false);
    }

    handleSectionSummaryAction(event) {
        const button = event.target.closest('button[data-entry-action]');
        if (!button) return;

        const collection = button.dataset.entryCollection;
        const index = Number(button.dataset.entryIndex);
        if (!this.getEntryFormConfig(collection) || !Number.isInteger(index) || !this[collection][index]) return;

        if (button.dataset.entryAction === 'edit') {
            this.beginEntryEdit(collection, index);
            return;
        }

        if (button.dataset.entryAction === 'delete' && confirm('Delete this BOM entry?')) {
            if (this.editingEntry) this.cancelEntryEdit();
            this[collection].splice(index, 1);
            this.updateSummaries();
            this.saveAutosave();
            this.showMessage('BOM entry deleted successfully', 'success');
        }
    }

    // Add standard section
    addStandardSection() {
        const sectionType = document.getElementById('sectionType').value;
        const sectionSize = document.getElementById('sectionSize').value;
        const quantity = parseInt(document.getElementById('quantity').value);
        const length = parseFloat(document.getElementById('length').value);
        const additionalWebPlateWidth = parseFloat(document.getElementById('additionalWebPlateWidth').value) || 0;
        const additionalWebPlateThickness = parseFloat(document.getElementById('additionalWebPlateThickness').value) || 0;
        const additionalTopFlangePlateWidth = parseFloat(document.getElementById('additionalTopFlangePlateWidth').value) || 0;
        const additionalTopFlangePlateThickness = parseFloat(document.getElementById('additionalTopFlangePlateThickness').value) || 0;
        const additionalBottomFlangePlateWidth = parseFloat(document.getElementById('additionalBottomFlangePlateWidth').value) || 0;
        const additionalBottomFlangePlateThickness = parseFloat(document.getElementById('additionalBottomFlangePlateThickness').value) || 0;

        if (!sectionType || !sectionSize || !quantity || !length) {
            this.showMessage('Please fill all fields for standard section', 'error');
            return;
        }

        const sectionData = this.sectionDatabase[sectionType][sectionSize];
        const displayName = this.getStandardSectionDisplayName(sectionType, sectionSize, sectionData);
        const plates = [];
        let additionalPlateWeight = 0;

        if (additionalWebPlateWidth || additionalWebPlateThickness) {
            if (!additionalWebPlateWidth || !additionalWebPlateThickness) {
                this.showMessage('Please enter web plate width and thickness', 'error');
                return;
            }

            const webPlateWeight = additionalWebPlateWidth * additionalWebPlateThickness / 1000000 * length * quantity * 7850;
            plates.push({
                type: 'Additional Web Plate',
                dimensions: `${additionalWebPlateWidth} x ${length * 1000}`,
                thickness: additionalWebPlateThickness,
                quantity: quantity,
                area: additionalWebPlateWidth * length / 1000 * quantity,
                weight: webPlateWeight
            });
            additionalPlateWeight += webPlateWeight;
        }

        if (additionalTopFlangePlateWidth || additionalTopFlangePlateThickness) {
            if (!additionalTopFlangePlateWidth || !additionalTopFlangePlateThickness) {
                this.showMessage('Please enter top flange plate width and thickness', 'error');
                return;
            }

            const topFlangePlateWeight = additionalTopFlangePlateWidth * additionalTopFlangePlateThickness / 1000000 * length * quantity * 7850;
            plates.push({
                type: 'Additional Top Flange Plate',
                dimensions: `${additionalTopFlangePlateWidth} x ${length * 1000}`,
                thickness: additionalTopFlangePlateThickness,
                quantity: quantity,
                area: additionalTopFlangePlateWidth * length / 1000 * quantity,
                weight: topFlangePlateWeight
            });
            additionalPlateWeight += topFlangePlateWeight;
        }

        if (additionalBottomFlangePlateWidth || additionalBottomFlangePlateThickness) {
            if (!additionalBottomFlangePlateWidth || !additionalBottomFlangePlateThickness) {
                this.showMessage('Please enter bottom flange plate width and thickness', 'error');
                return;
            }

            const bottomFlangePlateWeight = additionalBottomFlangePlateWidth * additionalBottomFlangePlateThickness / 1000000 * length * quantity * 7850;
            plates.push({
                type: 'Additional Bottom Flange Plate',
                dimensions: `${additionalBottomFlangePlateWidth} x ${length * 1000}`,
                thickness: additionalBottomFlangePlateThickness,
                quantity: quantity,
                area: additionalBottomFlangePlateWidth * length / 1000 * quantity,
                weight: bottomFlangePlateWeight
            });
            additionalPlateWeight += bottomFlangePlateWeight;
        }

        const totalWeight = sectionData.weight * length * quantity + additionalPlateWeight;

        const section = {
            id: Date.now(),
            type: sectionType,
            size: displayName,
            quantity: quantity,
            length: length,
            unitWeight: sectionData.weight,
            totalWeight: totalWeight,
            depth: sectionData.depth,
            width: sectionData.width,
            plates: plates
        };

        const wasEditing = this.saveEntry('standardSections', section);
        this.updateSummaries();
        this.saveAutosave();
        this.showMessage(wasEditing ? 'Standard section updated successfully' : 'Standard section added successfully', 'success');
        this.clearStandardSectionForm();
    }

    // Calculate I-section web height based on total depth and flange thickness
    calculateIWebHeight() {
        const totalDepth = parseFloat(document.getElementById('totalDepth').value) || 0;
        const flangeThickness = parseFloat(document.getElementById('flangeThickness').value) || 0;
        const webHeight = totalDepth - (2 * flangeThickness);
        
        document.getElementById('calculatedWebHeight').value = webHeight > 0 ? webHeight.toFixed(0) : '0';
    }

    // Calculate box section web height based on total depth and flange thickness
    calculateBoxWebHeight() {
        const totalDepth = parseFloat(document.getElementById('boxTotalDepth').value) || 0;
        const flangeThickness = parseFloat(document.getElementById('boxFlangeThickness').value) || 0;
        const webHeight = totalDepth - (2 * flangeThickness);
        
        document.getElementById('calculatedBoxWebHeight').value = webHeight > 0 ? webHeight.toFixed(0) : '0';
    }

    // Get current steel rate from user input or use default
    getCurrentSteelRate() {
        const userRate = parseFloat(document.getElementById('steelRate').value);
        return userRate > 0 ? userRate : this.defaultSteelRate;
    }

    // Add I-section plate girder
    addIGirder() {
        console.log('addIGirder called'); // Debug log
        const length = parseFloat(document.getElementById('girderLength').value);
        const totalDepth = parseFloat(document.getElementById('totalDepth').value);
        const flangeWidth = parseFloat(document.getElementById('flangeWidth').value);
        const flangeThickness = parseFloat(document.getElementById('flangeThickness').value);
        const webThickness = parseFloat(document.getElementById('webThickness').value);
        const additionalWebPlateWidth = parseFloat(document.getElementById('iAdditionalWebPlateWidth').value) || 0;
        const additionalWebPlateThickness = parseFloat(document.getElementById('iAdditionalWebPlateThickness').value) || 0;
        const additionalTopFlangePlateWidth = parseFloat(document.getElementById('iAdditionalTopFlangePlateWidth').value) || 0;
        const additionalTopFlangePlateThickness = parseFloat(document.getElementById('iAdditionalTopFlangePlateThickness').value) || 0;
        const additionalBottomFlangePlateWidth = parseFloat(document.getElementById('iAdditionalBottomFlangePlateWidth').value) || 0;
        const additionalBottomFlangePlateThickness = parseFloat(document.getElementById('iAdditionalBottomFlangePlateThickness').value) || 0;

        if (!length || !totalDepth || !flangeWidth || !flangeThickness || !webThickness) {
            this.showMessage('Please fill all required fields for I-section girder', 'error');
            return;
        }

        // Calculate web height
        const webHeight = totalDepth - (2 * flangeThickness);
        
        if (webHeight <= 0) {
            this.showMessage('Invalid dimensions: Web height would be zero or negative', 'error');
            return;
        }

        // Calculate plate weights
        const webArea = webHeight * webThickness / 1000000; // m²
        const webWeight = webArea * length * 7850; // kg (steel density)

        const flangeArea = flangeWidth * flangeThickness / 1000000; // m²
        const flangeWeight = flangeArea * length * 7850 * 2; // kg (2 flanges)

        const plates = [
            {
                type: 'Web Plate',
                dimensions: `${webHeight} x ${length * 1000}`,
                thickness: webThickness,
                quantity: 1,
                area: webArea * length,
                weight: webWeight
            },
            {
                type: 'Flange Plate',
                dimensions: `${flangeWidth} x ${length * 1000}`,
                thickness: flangeThickness,
                quantity: 2,
                area: flangeArea * length * 2,
                weight: flangeWeight
            }
        ];
        let additionalWebPlateWeight = 0;
        let additionalTopFlangePlateWeight = 0;
        let additionalBottomFlangePlateWeight = 0;

        if (additionalWebPlateWidth || additionalWebPlateThickness) {
            if (!additionalWebPlateWidth || !additionalWebPlateThickness) {
                this.showMessage('Please enter I-section additional web plate width and thickness', 'error');
                return;
            }

            additionalWebPlateWeight = additionalWebPlateWidth * additionalWebPlateThickness / 1000000 * length * 4 * 7850;
            plates.push({
                type: 'Additional Web Plate (2 each side)',
                dimensions: `${additionalWebPlateWidth} x ${length * 1000}`,
                thickness: additionalWebPlateThickness,
                quantity: 4,
                area: additionalWebPlateWidth * length / 1000 * 4,
                weight: additionalWebPlateWeight
            });
        }

        if (additionalTopFlangePlateWidth || additionalTopFlangePlateThickness) {
            if (!additionalTopFlangePlateWidth || !additionalTopFlangePlateThickness) {
                this.showMessage('Please enter I-section additional top flange plate width and thickness', 'error');
                return;
            }

            additionalTopFlangePlateWeight = additionalTopFlangePlateWidth * additionalTopFlangePlateThickness / 1000000 * length * 7850;
            plates.push({
                type: 'Additional Top Flange Plate',
                dimensions: `${additionalTopFlangePlateWidth} x ${length * 1000}`,
                thickness: additionalTopFlangePlateThickness,
                quantity: 1,
                area: additionalTopFlangePlateWidth * length / 1000,
                weight: additionalTopFlangePlateWeight
            });
        }

        if (additionalBottomFlangePlateWidth || additionalBottomFlangePlateThickness) {
            if (!additionalBottomFlangePlateWidth || !additionalBottomFlangePlateThickness) {
                this.showMessage('Please enter I-section additional bottom flange plate width and thickness', 'error');
                return;
            }

            additionalBottomFlangePlateWeight = additionalBottomFlangePlateWidth * additionalBottomFlangePlateThickness / 1000000 * length * 7850;
            plates.push({
                type: 'Additional Bottom Flange Plate',
                dimensions: `${additionalBottomFlangePlateWidth} x ${length * 1000}`,
                thickness: additionalBottomFlangePlateThickness,
                quantity: 1,
                area: additionalBottomFlangePlateWidth * length / 1000,
                weight: additionalBottomFlangePlateWeight
            });
        }

        const totalWeight = webWeight + flangeWeight + additionalWebPlateWeight + additionalTopFlangePlateWeight + additionalBottomFlangePlateWeight;
        const unitWeight = totalWeight / length; // kg per metre
        const size = this.formatGirderSize(totalDepth, flangeWidth, flangeThickness, webThickness);

        const girder = {
            id: Date.now(),
            size: size,
            length: length,
            totalDepth: totalDepth,
            webHeight: webHeight,
            webThickness: webThickness,
            flangeWidth: flangeWidth,
            flangeThickness: flangeThickness,
            webWeight: webWeight,
            flangeWeight: flangeWeight,
            totalWeight: totalWeight,
            unitWeight: unitWeight,
            plates: plates
        };

        const wasEditing = this.saveEntry('iGirders', girder);
        this.updateSummaries();
        this.saveAutosave();
        this.showMessage(wasEditing ? 'I-section plate girder updated successfully' : 'I-section plate girder added successfully', 'success');
        this.clearIGirderForm();
    }

    // Add box section plate girder
    addBoxGirder() {
        console.log('addBoxGirder called'); // Debug log
        const length = parseFloat(document.getElementById('boxGirderLength').value);
        const totalDepth = parseFloat(document.getElementById('boxTotalDepth').value);
        const width = parseFloat(document.getElementById('boxWidth').value);
        const flangeThickness = parseFloat(document.getElementById('boxFlangeThickness').value);
        const webThickness = parseFloat(document.getElementById('boxWebThickness').value);
        const additionalWebPlateWidth = parseFloat(document.getElementById('boxAdditionalWebPlateWidth').value) || 0;
        const additionalWebPlateThickness = parseFloat(document.getElementById('boxAdditionalWebPlateThickness').value) || 0;
        const additionalTopFlangePlateWidth = parseFloat(document.getElementById('boxAdditionalTopFlangePlateWidth').value) || 0;
        const additionalTopFlangePlateThickness = parseFloat(document.getElementById('boxAdditionalTopFlangePlateThickness').value) || 0;
        const additionalBottomFlangePlateWidth = parseFloat(document.getElementById('boxAdditionalBottomFlangePlateWidth').value) || 0;
        const additionalBottomFlangePlateThickness = parseFloat(document.getElementById('boxAdditionalBottomFlangePlateThickness').value) || 0;

        if (!length || !totalDepth || !width || !flangeThickness || !webThickness) {
            this.showMessage('Please fill all required fields for box section girder', 'error');
            return;
        }

        // Calculate web height
        const webHeight = totalDepth - (2 * flangeThickness);
        
        if (webHeight <= 0) {
            this.showMessage('Invalid dimensions: Web height would be zero or negative', 'error');
            return;
        }

        // Calculate plate weights
        const topArea = width * flangeThickness / 1000000; // m²
        const topWeight = topArea * length * 7850; // kg

        const bottomArea = width * flangeThickness / 1000000; // m²
        const bottomWeight = bottomArea * length * 7850; // kg

        const sideArea = webHeight * webThickness / 1000000; // m²
        const sideWeight = sideArea * length * 7850 * 2; // kg (2 sides)

        const plates = [
            {
                type: 'Flange Plate',
                dimensions: `${width} x ${length * 1000}`,
                thickness: flangeThickness,
                quantity: 2,
                area: (topArea + bottomArea) * length,
                weight: topWeight + bottomWeight
            },
            {
                type: 'Web Plate',
                dimensions: `${webHeight} x ${length * 1000}`,
                thickness: webThickness,
                quantity: 2,
                area: sideArea * length * 2,
                weight: sideWeight
            }
        ];
        let additionalWebPlateWeight = 0;
        let additionalTopFlangePlateWeight = 0;
        let additionalBottomFlangePlateWeight = 0;

        if (additionalWebPlateWidth || additionalWebPlateThickness) {
            if (!additionalWebPlateWidth || !additionalWebPlateThickness) {
                this.showMessage('Please enter box-section additional web plate width and thickness', 'error');
                return;
            }

            additionalWebPlateWeight = additionalWebPlateWidth * additionalWebPlateThickness / 1000000 * length * 4 * 7850;
            plates.push({
                type: 'Additional Web Plate (2 each side)',
                dimensions: `${additionalWebPlateWidth} x ${length * 1000}`,
                thickness: additionalWebPlateThickness,
                quantity: 4,
                area: additionalWebPlateWidth * length / 1000 * 4,
                weight: additionalWebPlateWeight
            });
        }

        if (additionalTopFlangePlateWidth || additionalTopFlangePlateThickness) {
            if (!additionalTopFlangePlateWidth || !additionalTopFlangePlateThickness) {
                this.showMessage('Please enter box-section additional top flange plate width and thickness', 'error');
                return;
            }

            additionalTopFlangePlateWeight = additionalTopFlangePlateWidth * additionalTopFlangePlateThickness / 1000000 * length * 7850;
            plates.push({
                type: 'Additional Top Flange Plate',
                dimensions: `${additionalTopFlangePlateWidth} x ${length * 1000}`,
                thickness: additionalTopFlangePlateThickness,
                quantity: 1,
                area: additionalTopFlangePlateWidth * length / 1000,
                weight: additionalTopFlangePlateWeight
            });
        }

        if (additionalBottomFlangePlateWidth || additionalBottomFlangePlateThickness) {
            if (!additionalBottomFlangePlateWidth || !additionalBottomFlangePlateThickness) {
                this.showMessage('Please enter box-section additional bottom flange plate width and thickness', 'error');
                return;
            }

            additionalBottomFlangePlateWeight = additionalBottomFlangePlateWidth * additionalBottomFlangePlateThickness / 1000000 * length * 7850;
            plates.push({
                type: 'Additional Bottom Flange Plate',
                dimensions: `${additionalBottomFlangePlateWidth} x ${length * 1000}`,
                thickness: additionalBottomFlangePlateThickness,
                quantity: 1,
                area: additionalBottomFlangePlateWidth * length / 1000,
                weight: additionalBottomFlangePlateWeight
            });
        }

        const totalWeight = topWeight + bottomWeight + sideWeight + additionalWebPlateWeight + additionalTopFlangePlateWeight + additionalBottomFlangePlateWeight;
        const unitWeight = totalWeight / length; // kg per metre
        const size = this.formatGirderSize(totalDepth, width, flangeThickness, webThickness);

        const girder = {
            id: Date.now(),
            size: size,
            length: length,
            totalDepth: totalDepth,
            webHeight: webHeight,
            width: width,
            flangeThickness: flangeThickness,
            webThickness: webThickness,
            topWeight: topWeight,
            bottomWeight: bottomWeight,
            sideWeight: sideWeight,
            additionalWebPlateWeight: additionalWebPlateWeight,
            totalWeight: totalWeight,
            unitWeight: unitWeight,
            plates: plates
        };

        const wasEditing = this.saveEntry('boxGirders', girder);
        this.updateSummaries();
        this.saveAutosave();
        this.showMessage(wasEditing ? 'Box section plate girder updated successfully' : 'Box section plate girder added successfully', 'success');
        this.clearBoxGirderForm();
    }

    // Show message
    showMessage(message, type) {
        console.log('Showing message:', message, type); // Debug log
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.insertBefore(messageDiv, mainContent.firstChild);
            
            setTimeout(() => {
                messageDiv.remove();
            }, 5000); // Increased to 5 seconds for better visibility
        } else {
            console.error('Main content not found');
        }
    }

    // Clear standard section form
    clearStandardSectionForm() {
        document.getElementById('sectionType').value = '';
        document.getElementById('sectionSize').value = '';
        document.getElementById('sectionSize').disabled = true;
        document.getElementById('quantity').value = '1';
        document.getElementById('length').value = '1.0';
        document.getElementById('additionalWebPlateWidth').value = '';
        document.getElementById('additionalWebPlateThickness').value = '';
        document.getElementById('additionalTopFlangePlateWidth').value = '';
        document.getElementById('additionalTopFlangePlateThickness').value = '';
        document.getElementById('additionalBottomFlangePlateWidth').value = '';
        document.getElementById('additionalBottomFlangePlateThickness').value = '';
    }

    // Clear I-section girder form
    clearIGirderForm() {
        document.getElementById('girderLength').value = '10.0';
        document.getElementById('totalDepth').value = '800';
        document.getElementById('flangeWidth').value = '300';
        document.getElementById('flangeThickness').value = '12';
        document.getElementById('webThickness').value = '8';
        document.getElementById('iAdditionalWebPlateWidth').value = '';
        document.getElementById('iAdditionalWebPlateThickness').value = '';
        document.getElementById('iAdditionalTopFlangePlateWidth').value = '';
        document.getElementById('iAdditionalTopFlangePlateThickness').value = '';
        document.getElementById('iAdditionalBottomFlangePlateWidth').value = '';
        document.getElementById('iAdditionalBottomFlangePlateThickness').value = '';
        this.calculateIWebHeight();
    }

    // Clear box section girder form
    clearBoxGirderForm() {
        document.getElementById('boxGirderLength').value = '10.0';
        document.getElementById('boxTotalDepth').value = '800';
        document.getElementById('boxWidth').value = '400';
        document.getElementById('boxFlangeThickness').value = '12';
        document.getElementById('boxWebThickness').value = '8';
        document.getElementById('boxAdditionalWebPlateWidth').value = '';
        document.getElementById('boxAdditionalWebPlateThickness').value = '';
        document.getElementById('boxAdditionalTopFlangePlateWidth').value = '';
        document.getElementById('boxAdditionalTopFlangePlateThickness').value = '';
        document.getElementById('boxAdditionalBottomFlangePlateWidth').value = '';
        document.getElementById('boxAdditionalBottomFlangePlateThickness').value = '';
        this.calculateBoxWebHeight();
    }

    // Clear all data
    clearAll() {
        if (confirm('Are you sure you want to clear all data?')) {
            if (this.editingEntry) this.cancelEntryEdit();
            this.standardSections = [];
            this.iGirders = [];
            this.boxGirders = [];
            this.updateSummaries();
            try {
                localStorage.removeItem(this.storageKey);
            } catch (e) {
                // ignore — nothing to clean up if storage is unavailable
            }
            this.setAutosaveStatus('');
            this.showMessage('All data cleared successfully', 'success');
        }
    }

    // Update all summaries
    updateSummaries() {
        this.updateSectionSummary();
        this.updatePlateSummary();
        this.updateDetailedBreakdown();
        this.updateTotalSummary();
    }

    // Update section-wise summary
    updateSectionSummary() {
        const tbody = document.getElementById('sectionTableBody');
        tbody.innerHTML = '';

        // Add standard sections
        this.standardSections.forEach((section, index) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${section.type}</td>
                <td>${this.getBomSectionLabel(section.size, section.plates)}</td>
                <td>${section.quantity}</td>
                <td>${section.length}</td>
                <td>${section.unitWeight.toFixed(2)}</td>
                <td>${section.totalWeight.toFixed(2)}</td>
                <td class="summary-row-actions">${this.getEntryActionButtons('standardSections', index)}</td>
            `;
        });

        // Add I-section girders
        this.iGirders.forEach((girder, index) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>I-Section Plate Girder</td>
                <td>${this.getBomSectionLabel(this.getGirderSize(girder), girder.plates)}</td>
                <td>1</td>
                <td>${girder.length}</td>
                <td>${girder.unitWeight.toFixed(2)}</td>
                <td>${girder.totalWeight.toFixed(2)}</td>
                <td class="summary-row-actions">${this.getEntryActionButtons('iGirders', index)}</td>
            `;
        });

        // Add box section girders
        this.boxGirders.forEach((girder, index) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>Box Section Plate Girder</td>
                <td>${this.getBomSectionLabel(this.getGirderSize(girder), girder.plates)}</td>
                <td>1</td>
                <td>${girder.length}</td>
                <td>${girder.unitWeight.toFixed(2)}</td>
                <td>${girder.totalWeight.toFixed(2)}</td>
                <td class="summary-row-actions">${this.getEntryActionButtons('boxGirders', index)}</td>
            `;
        });
    }

    getEntryActionButtons(collection, index) {
        return `
            <button type="button" class="row-action-btn" data-entry-action="edit" data-entry-collection="${collection}" data-entry-index="${index}" aria-label="Edit entry" title="Edit entry"><i class="fas fa-pen"></i></button>
            <button type="button" class="row-action-btn delete-entry" data-entry-action="delete" data-entry-collection="${collection}" data-entry-index="${index}" aria-label="Delete entry" title="Delete entry"><i class="fas fa-trash"></i></button>
        `;
    }

    // Update plate-wise summary
    updatePlateSummary() {
        const tbody = document.getElementById('plateTableBody');
        const tfoot = document.getElementById('plateTableFooter');
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        let totalPlateWeight = 0;

        // Add optional plates from standard sections
        this.standardSections.forEach(section => {
            let sectionPlateWeight = 0;

            (section.plates || []).forEach(plate => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${section.size}</td>
                    <td>${plate.type}</td>
                    <td>${plate.dimensions}</td>
                    <td>${plate.thickness}</td>
                    <td>${plate.quantity}</td>
                    <td>${plate.area.toFixed(2)}</td>
                    <td>${plate.weight.toFixed(2)}</td>
                `;
                sectionPlateWeight += plate.weight;
            });

            if (section.plates && section.plates.length > 1) {
                const totalRow = tbody.insertRow();
                totalRow.style.backgroundColor = '#f8f9fa';
                totalRow.style.fontWeight = 'bold';
                totalRow.innerHTML = `
                    <td colspan="6" style="text-align: right;"><strong>${section.size} - Total Weight:</strong></td>
                    <td><strong>${sectionPlateWeight.toFixed(2)} kg</strong></td>
                `;
            }

            totalPlateWeight += sectionPlateWeight;
        });

        // Add plates from I-section girders
        this.iGirders.forEach(girder => {
            let girderTotalWeight = 0;
            
            girder.plates.forEach(plate => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${this.getGirderSize(girder)}</td>
                    <td>${plate.type}</td>
                    <td>${plate.dimensions}</td>
                    <td>${plate.thickness}</td>
                    <td>${plate.quantity}</td>
                    <td>${plate.area.toFixed(2)}</td>
                    <td>${plate.weight.toFixed(2)}</td>
                `;
                girderTotalWeight += plate.weight;
            });

            // Add girder total row
            if (girder.plates.length > 1) {
                const totalRow = tbody.insertRow();
                totalRow.style.backgroundColor = '#f8f9fa';
                totalRow.style.fontWeight = 'bold';
                totalRow.innerHTML = `
                    <td colspan="6" style="text-align: right;"><strong>${this.getGirderSize(girder)} - Total Weight:</strong></td>
                    <td><strong>${girderTotalWeight.toFixed(2)} kg</strong></td>
                `;
            }
            
            totalPlateWeight += girderTotalWeight;
        });

        // Add plates from box section girders
        this.boxGirders.forEach(girder => {
            let girderTotalWeight = 0;
            
            girder.plates.forEach(plate => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${this.getGirderSize(girder)}</td>
                    <td>${plate.type}</td>
                    <td>${plate.dimensions}</td>
                    <td>${plate.thickness}</td>
                    <td>${plate.quantity}</td>
                    <td>${plate.area.toFixed(2)}</td>
                    <td>${plate.weight.toFixed(2)}</td>
                `;
                girderTotalWeight += plate.weight;
            });

            // Add girder total row
            if (girder.plates.length > 1) {
                const totalRow = tbody.insertRow();
                totalRow.style.backgroundColor = '#f8f9fa';
                totalRow.style.fontWeight = 'bold';
                totalRow.innerHTML = `
                    <td colspan="6" style="text-align: right;"><strong>${this.getGirderSize(girder)} - Total Weight:</strong></td>
                    <td><strong>${girderTotalWeight.toFixed(2)} kg</strong></td>
                `;
            }
            
            totalPlateWeight += girderTotalWeight;
        });

        // Add overall total in footer
        if (totalPlateWeight > 0) {
            const footerRow = tfoot.insertRow();
            footerRow.style.backgroundColor = '#e9ecef';
            footerRow.style.fontWeight = 'bold';
            footerRow.style.fontSize = '1.1rem';
            footerRow.innerHTML = `
                <td colspan="6" style="text-align: right;"><strong>TOTAL WEIGHT:</strong></td>
                <td><strong>${totalPlateWeight.toFixed(2)} kg</strong></td>
            `;
        }

        // Add thickness-wise summary
        this.addThicknessWiseSummary();
    }

    // Add thickness-wise summary
    addThicknessWiseSummary() {
        const tfoot = document.getElementById('plateTableFooter');
        
        // Collect all plates by thickness
        const thicknessMap = new Map();

        // Add plates from I-section girders
        this.iGirders.forEach(girder => {
            girder.plates.forEach(plate => {
                const key = plate.thickness;
                if (!thicknessMap.has(key)) {
                    thicknessMap.set(key, {
                        thickness: key,
                        totalWeight: 0,
                        count: 0
                    });
                }
                const entry = thicknessMap.get(key);
                entry.totalWeight += plate.weight;
                entry.count += plate.quantity;
            });
        });

        // Add plates from box section girders
        this.boxGirders.forEach(girder => {
            girder.plates.forEach(plate => {
                const key = plate.thickness;
                if (!thicknessMap.has(key)) {
                    thicknessMap.set(key, {
                        thickness: key,
                        totalWeight: 0,
                        count: 0
                    });
                }
                const entry = thicknessMap.get(key);
                entry.totalWeight += plate.weight;
                entry.count += plate.quantity;
            });
        });

        // Add thickness-wise summary rows
        const sortedThicknesses = Array.from(thicknessMap.keys()).sort((a, b) => a - b);
        
        if (sortedThicknesses.length > 0) {
            // Add separator row
            const separatorRow = tfoot.insertRow();
            separatorRow.style.backgroundColor = '#dee2e6';
            separatorRow.innerHTML = `<td colspan="7" style="text-align: center; font-weight: bold; padding: 10px;">THICKNESS-WISE SUMMARY</td>`;

            // Create horizontal grid for thickness summary
            const maxColumns = 3; // Maximum columns in the grid
            const thicknessEntries = sortedThicknesses.map(thickness => {
                const entry = thicknessMap.get(thickness);
                return { thickness, weight: entry.totalWeight };
            });

            // Group thicknesses into rows
            for (let i = 0; i < thicknessEntries.length; i += maxColumns) {
                const rowEntries = thicknessEntries.slice(i, i + maxColumns);
                const thicknessRow = tfoot.insertRow();
                thicknessRow.style.backgroundColor = '#f8f9fa';
                thicknessRow.style.fontWeight = 'bold';
                
                let rowHTML = '';
                rowEntries.forEach((entry, index) => {
                    const colSpan = index === 0 ? 2 : 2; // First item takes 2 cols, others take 2 cols
                    const textAlign = index === 0 ? 'right' : 'center';
                    rowHTML += `<td colspan="${colSpan}" style="text-align: ${textAlign}; padding: 8px;"><strong>${entry.thickness}mm:</strong></td>`;
                    rowHTML += `<td style="text-align: left; padding: 8px;"><strong>${entry.weight.toFixed(2)} kg</strong></td>`;
                });
                
                // Fill remaining cells if row is not full
                const remainingCols = maxColumns - rowEntries.length;
                if (remainingCols > 0) {
                    rowHTML += `<td colspan="${remainingCols * 2}" style="text-align: center;"></td>`;
                }
                
                thicknessRow.innerHTML = rowHTML;
            }
        }
    }

    // Update detailed breakdown
    updateDetailedBreakdown() {
        // Standard sections
        const standardList = document.getElementById('standardSectionsList');
        standardList.innerHTML = '';
        
        if (this.standardSections.length === 0) {
            standardList.innerHTML = '<p>No standard sections added</p>';
        } else {
            this.standardSections.forEach(section => {
                const div = document.createElement('div');
                div.className = 'breakdown-item';
                div.innerHTML = `
                    <strong>${section.type} ${section.size}</strong><br>
                    Quantity: ${section.quantity}, Length: ${section.length}m<br>
                    Unit Weight: ${section.unitWeight} kg/m, Total Weight: ${section.totalWeight.toFixed(2)} kg
                `;
                standardList.appendChild(div);
            });
        }

        // I-section girders
        const iGirdersList = document.getElementById('iGirdersList');
        iGirdersList.innerHTML = '';
        
        if (this.iGirders.length === 0) {
            iGirdersList.innerHTML = '<p>No I-section plate girders added</p>';
        } else {
            this.iGirders.forEach(girder => {
                const div = document.createElement('div');
                div.className = 'breakdown-item';
                div.innerHTML = `
                    <strong>${this.getGirderSize(girder)}</strong><br>
                    Length: ${girder.length}m, Total Depth: ${girder.totalDepth}mm<br>
                    Flange Width: ${girder.flangeWidth}mm, Flange Thickness: ${girder.flangeThickness}mm, Web Thickness: ${girder.webThickness}mm<br>
                    Unit Weight: ${girder.unitWeight.toFixed(2)} kg/m, Total Weight: ${girder.totalWeight.toFixed(2)} kg
                `;
                iGirdersList.appendChild(div);
            });
        }

        // Box section girders
        const boxGirdersList = document.getElementById('boxGirdersList');
        boxGirdersList.innerHTML = '';
        
        if (this.boxGirders.length === 0) {
            boxGirdersList.innerHTML = '<p>No box section plate girders added</p>';
        } else {
            this.boxGirders.forEach(girder => {
                const div = document.createElement('div');
                div.className = 'breakdown-item';
                div.innerHTML = `
                    <strong>${this.getGirderSize(girder)}</strong><br>
                    Length: ${girder.length}m, Total Depth: ${girder.totalDepth}mm, Flange Width: ${girder.width}mm<br>
                    Flange Thickness: ${girder.flangeThickness}mm, Web Thickness: ${girder.webThickness}mm<br>
                    Unit Weight: ${girder.unitWeight.toFixed(2)} kg/m, Total Weight: ${girder.totalWeight.toFixed(2)} kg
                `;
                boxGirdersList.appendChild(div);
            });
        }
    }

    // Update total summary
    updateTotalSummary() {
        const standardWeight = this.standardSections.reduce((sum, section) => sum + section.totalWeight, 0);
        const girderWeight = this.iGirders.reduce((sum, girder) => sum + girder.totalWeight, 0) +
                            this.boxGirders.reduce((sum, girder) => sum + girder.totalWeight, 0);
        const totalWeight = standardWeight + girderWeight;
        const currentSteelRate = this.getCurrentSteelRate();
        const totalCost = totalWeight * currentSteelRate; // Cost in ₹

        document.getElementById('totalWeight').textContent = `${totalWeight.toFixed(2)} kg`;
        document.getElementById('standardWeight').textContent = `${standardWeight.toFixed(2)} kg`;
        document.getElementById('girderWeight').textContent = `${girderWeight.toFixed(2)} kg`;
        document.getElementById('totalCost').textContent = `₹${totalCost.toFixed(2)}`;
    }

    // Export to Excel
    exportToExcel() {
        const projectName = document.getElementById('projectName').value || 'Steel_BOM';
        const buildingName = document.getElementById('buildingName').value || '';
        const projectDate = document.getElementById('projectDate').value || new Date().toISOString().split('T')[0];
        const engineer = document.getElementById('engineer').value || '';

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Project Information Sheet
        const currentSteelRate = this.getCurrentSteelRate();
        const projectInfo = [
            ['PROJECT INFORMATION'],
            [''],
            ['Project Name:', projectName],
            ['Building / Structure Name:', buildingName],
            ['Date:', projectDate],
            ['Engineer:', engineer],
            ['Steel Rate:', `₹${currentSteelRate.toFixed(2)} per kg`],
            [''],
            ['TOTAL SUMMARY'],
            [''],
            ['Total Weight:', `${this.getTotalWeight().toFixed(2)} kg`],
            ['Standard Sections Weight:', `${this.getStandardWeight().toFixed(2)} kg`],
            ['Plate Girders Weight:', `${this.getGirderWeight().toFixed(2)} kg`],
            ['Total Cost (₹):', `₹${this.getTotalCost().toFixed(2)}`],
            [''],
            ['Steel Rate Used:', `₹${currentSteelRate.toFixed(2)} per kg`]
        ];

        const wsProject = XLSX.utils.aoa_to_sheet(projectInfo);
        XLSX.utils.book_append_sheet(wb, wsProject, "Project Info");

        // Section Summary Sheet
        const sectionData = [
            ['SECTION-WISE SUMMARY'],
            [''],
            ['Section Type', 'Size', 'Quantity', 'Length (m)', 'Unit Weight (kg/m)', 'Total Weight (kg)']
        ];

        // Add standard sections
        this.standardSections.forEach(section => {
            sectionData.push([
                section.type,
                this.getBomSectionLabel(section.size, section.plates),
                section.quantity,
                section.length,
                section.unitWeight,
                section.totalWeight.toFixed(2)
            ]);
        });

        // Add plate girders
        this.iGirders.forEach(girder => {
            sectionData.push([
                'I-Section Plate Girder',
                this.getBomSectionLabel(this.getGirderSize(girder), girder.plates),
                1,
                girder.length,
                girder.unitWeight.toFixed(2),
                girder.totalWeight.toFixed(2)
            ]);
        });

        this.boxGirders.forEach(girder => {
            sectionData.push([
                'Box Section Plate Girder',
                this.getBomSectionLabel(this.getGirderSize(girder), girder.plates),
                1,
                girder.length,
                girder.unitWeight.toFixed(2),
                girder.totalWeight.toFixed(2)
            ]);
        });

        const wsSection = XLSX.utils.aoa_to_sheet(sectionData);
        XLSX.utils.book_append_sheet(wb, wsSection, "Section Summary");

        // Plate Summary Sheet
        const plateData = [
            ['PLATE-WISE SUMMARY'],
            [''],
            ['Plate Type', 'Dimensions (mm)', 'Thickness (mm)', 'Quantity', 'Area (m²)', 'Weight (kg)']
        ];

        // Add optional plates from standard sections
        this.standardSections.forEach(section => {
            (section.plates || []).forEach(plate => {
                plateData.push([
                    `${plate.type} (${section.size})`,
                    plate.dimensions,
                    plate.thickness,
                    plate.quantity,
                    plate.area.toFixed(2),
                    plate.weight.toFixed(2)
                ]);
            });
        });

        // Add plates from I-section girders
        this.iGirders.forEach(girder => {
            girder.plates.forEach(plate => {
                plateData.push([
                    `${plate.type} (${this.getGirderSize(girder)})`,
                    plate.dimensions,
                    plate.thickness,
                    plate.quantity,
                    plate.area.toFixed(2),
                    plate.weight.toFixed(2)
                ]);
            });
        });

        // Add plates from box section girders
        this.boxGirders.forEach(girder => {
            girder.plates.forEach(plate => {
                plateData.push([
                    `${plate.type} (${this.getGirderSize(girder)})`,
                    plate.dimensions,
                    plate.thickness,
                    plate.quantity,
                    plate.area.toFixed(2),
                    plate.weight.toFixed(2)
                ]);
            });
        });

        const wsPlate = XLSX.utils.aoa_to_sheet(plateData);
        XLSX.utils.book_append_sheet(wb, wsPlate, "Plate Summary");

        // Section-wise Summary Sheet
        const sectionWiseData = [
            ['SECTION-WISE SUMMARY'],
            [''],
            ['Section Type', 'Section Name', 'Quantity', 'Length (m)', 'Unit Weight (kg/m)', 'Total Weight (kg)']
        ];

        // Add standard sections
        this.standardSections.forEach(section => {
            sectionWiseData.push([
                section.type,
                this.getBomSectionLabel(section.size, section.plates),
                section.quantity,
                section.length,
                section.unitWeight,
                section.totalWeight.toFixed(2)
            ]);
        });

        // Add I-section girders
        this.iGirders.forEach(girder => {
            sectionWiseData.push([
                'I-Section Plate Girder',
                this.getBomSectionLabel(this.getGirderSize(girder), girder.plates),
                1,
                girder.length,
                girder.unitWeight.toFixed(2),
                girder.totalWeight.toFixed(2)
            ]);
        });

        // Add box section girders
        this.boxGirders.forEach(girder => {
            sectionWiseData.push([
                'Box Section Plate Girder',
                this.getBomSectionLabel(this.getGirderSize(girder), girder.plates),
                1,
                girder.length,
                girder.unitWeight.toFixed(2),
                girder.totalWeight.toFixed(2)
            ]);
        });

        const wsSectionWise = XLSX.utils.aoa_to_sheet(sectionWiseData);
        XLSX.utils.book_append_sheet(wb, wsSectionWise, "Section-wise Summary");

        // Plate Thickness-wise Summary Sheet
        const thicknessWiseData = [
            ['PLATE THICKNESS-WISE SUMMARY'],
            [''],
            ['Thickness (mm)', 'Plate Type', 'Total Area (m²)', 'Total Weight (kg)', 'Count']
        ];

        // Collect all plates by thickness
        const thicknessMap = new Map();

        // Add plates from I-section girders
        this.iGirders.forEach(girder => {
            girder.plates.forEach(plate => {
                const key = plate.thickness;
                if (!thicknessMap.has(key)) {
                    thicknessMap.set(key, {
                        thickness: key,
                        plates: [],
                        totalArea: 0,
                        totalWeight: 0,
                        count: 0
                    });
                }
                const entry = thicknessMap.get(key);
                entry.plates.push(`${plate.type} (${this.getGirderSize(girder)})`);
                entry.totalArea += plate.area;
                entry.totalWeight += plate.weight;
                entry.count += plate.quantity;
            });
        });

        // Add plates from box section girders
        this.boxGirders.forEach(girder => {
            girder.plates.forEach(plate => {
                const key = plate.thickness;
                if (!thicknessMap.has(key)) {
                    thicknessMap.set(key, {
                        thickness: key,
                        plates: [],
                        totalArea: 0,
                        totalWeight: 0,
                        count: 0
                    });
                }
                const entry = thicknessMap.get(key);
                entry.plates.push(`${plate.type} (${this.getGirderSize(girder)})`);
                entry.totalArea += plate.area;
                entry.totalWeight += plate.weight;
                entry.count += plate.quantity;
            });
        });

        // Sort by thickness and add to data
        const sortedThicknesses = Array.from(thicknessMap.keys()).sort((a, b) => a - b);
        sortedThicknesses.forEach(thickness => {
            const entry = thicknessMap.get(thickness);
            thicknessWiseData.push([
                entry.thickness,
                entry.plates.join(', '),
                entry.totalArea.toFixed(2),
                entry.totalWeight.toFixed(2),
                entry.count
            ]);
        });

        const wsThicknessWise = XLSX.utils.aoa_to_sheet(thicknessWiseData);
        XLSX.utils.book_append_sheet(wb, wsThicknessWise, "Thickness-wise Summary");

        // Detailed Breakdown Sheet
        const detailedData = [
            ['DETAILED BREAKDOWN'],
            ['']
        ];

        // Standard sections
        detailedData.push(['STANDARD SECTIONS']);
        detailedData.push(['']);
        if (this.standardSections.length === 0) {
            detailedData.push(['No standard sections added']);
        } else {
            this.standardSections.forEach(section => {
                detailedData.push([
                    `${section.type} ${section.size}`,
                    `Quantity: ${section.quantity}, Length: ${section.length}m`,
                    `Unit Weight: ${section.unitWeight} kg/m, Total Weight: ${section.totalWeight.toFixed(2)} kg`
                ]);
                detailedData.push(['']);
            });
        }

        // I-section girders
        detailedData.push(['I-SECTION PLATE GIRDERS']);
        detailedData.push(['']);
        if (this.iGirders.length === 0) {
            detailedData.push(['No I-section plate girders added']);
        } else {
            this.iGirders.forEach(girder => {
                detailedData.push([
                    this.getGirderSize(girder),
                    `Length: ${girder.length}m, Total Depth: ${girder.totalDepth}mm`,
                    `Web: ${girder.webHeight}x${girder.webThickness}mm, Flanges: ${girder.flangeWidth}x${girder.flangeThickness}mm`,
                    `Unit Weight: ${girder.unitWeight.toFixed(2)} kg/m, Total Weight: ${girder.totalWeight.toFixed(2)} kg`
                ]);
                detailedData.push(['']);
            });
        }

        // Box section girders
        detailedData.push(['BOX SECTION PLATE GIRDERS']);
        detailedData.push(['']);
        if (this.boxGirders.length === 0) {
            detailedData.push(['No box section plate girders added']);
        } else {
            this.boxGirders.forEach(girder => {
                detailedData.push([
                    this.getGirderSize(girder),
                    `Length: ${girder.length}m, Total Depth: ${girder.totalDepth}mm, Flange Width: ${girder.width}mm`,
                    `Web: ${girder.webHeight}x${girder.webThickness}mm, Flanges: ${girder.flangeThickness}mm`,
                    `Unit Weight: ${girder.unitWeight.toFixed(2)} kg/m, Total Weight: ${girder.totalWeight.toFixed(2)} kg`
                ]);
                detailedData.push(['']);
            });
        }

        const wsDetailed = XLSX.utils.aoa_to_sheet(detailedData);
        XLSX.utils.book_append_sheet(wb, wsDetailed, "Detailed Breakdown");

        // Generate and download Excel file
        XLSX.writeFile(wb, `${projectName}_BOM.xlsx`);
        
        this.showMessage('Excel file exported successfully', 'success');
    }

    // Helper methods for getting totals
    getTotalWeight() {
        const standardWeight = this.standardSections.reduce((sum, section) => sum + section.totalWeight, 0);
        const girderWeight = this.iGirders.reduce((sum, girder) => sum + girder.totalWeight, 0) +
                            this.boxGirders.reduce((sum, girder) => sum + girder.totalWeight, 0);
        return standardWeight + girderWeight;
    }

    getStandardWeight() {
        return this.standardSections.reduce((sum, section) => sum + section.totalWeight, 0);
    }

    getGirderWeight() {
        return this.iGirders.reduce((sum, girder) => sum + girder.totalWeight, 0) +
               this.boxGirders.reduce((sum, girder) => sum + girder.totalWeight, 0);
    }

    getTotalCost() {
        return this.getTotalWeight() * this.getCurrentSteelRate(); // Cost in ₹
    }

    // Print BOM
    printBOM() {
        window.print();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SteelBOMCalculator();
});

// Add some CSS for breakdown items and calculated fields
const style = document.createElement('style');
style.textContent = `
    .breakdown-item {
        background: white;
        padding: 15px;
        margin: 10px 0;
        border-radius: 8px;
        border-left: 4px solid #3498db;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    
    .breakdown-item strong {
        color: #2c3e50;
        font-size: 1.1rem;
    }
    
    .breakdown-item p {
        margin: 5px 0;
        color: #7f8c8d;
    }
    
    #calculatedWebHeight, #calculatedBoxWebHeight {
        background-color: #f8f9fa;
        color: #495057;
        font-weight: 500;
        border: 2px solid #28a745;
    }
    
    #calculatedWebHeight:focus, #calculatedBoxWebHeight:focus {
        outline: none;
        border-color: #28a745;
        box-shadow: 0 0 0 0.2rem rgba(40, 167, 69, 0.25);
    }
    
    .form-help {
        color: #6c757d;
        font-size: 0.75rem;
        margin-top: 0.25rem;
        display: block;
        font-style: italic;
    }
    
    .message.error {
        background-color: #f8d7da;
        border-color: #f5c6cb;
        color: #721c24;
    }
    
    .message.error::before {
        content: "⚠️ ";
        font-weight: bold;
    }
`;
document.head.appendChild(style);
  
