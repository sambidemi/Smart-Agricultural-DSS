/* dashboard.js - Dashboard Functionality */
class DashboardManager {
    constructor() {
        // Deployment switch: set window.AGROSENSE_API_BASE_URL before this file loads.
        this.apiBaseUrl = window.AGROSENSE_API_BASE_URL || 'https://smart-agricultural-dss-production-5dd9.up.railway.app';
        this.token = localStorage.getItem('agrosense_token');
        this.userData = this.loadUserData();
        this.dynamicMessageIndex = 0;
        this.messageRotationTimer = null;
        this.recommendationHistoryLoaded = false;
        this.pricePredictionHistoryLoaded = false;
        this.marketAnalysisInitialized = false;
        this.init();
    }

    init() {
        this.cacheElements();
        if (!this.ensureAuthenticatedSession()) return;
        this.initPricePredictionModule();
        this.initMarketAnalysisModule();
        this.bindEvents();
        this.updateUI();
        this.initDynamicWelcomeMessage();
        this.initSidebar();
        this.initUserDropdown();
        // Always refresh dashboard/profile from API so UI reflects backend source-of-truth.
        this.refreshProfileFromApi();
        this.loadRecommendationHistory();
        this.loadPricePredictionHistory();
    }

    cacheElements() {
        // Dashboard summary elements.
        this.userNameSpan = document.getElementById('userName');
        this.farmerDetailsList = document.getElementById('farmerDetailsList');
        this.welcomeFarmerName = document.getElementById('welcomeFarmerName');
        this.dynamicWelcomeMessage = document.getElementById('dynamicWelcomeMessage');

        // Avatar elements.
        this.profileAvatarLarge = document.getElementById('profileAvatarLarge');
        this.uploadBtn = document.getElementById('uploadAvatarBtn');
        this.avatarInput = document.getElementById('avatarInput');
        this.profileAvatarLargeForm = document.getElementById('profileAvatarLargeForm');
        this.uploadBtnForm = document.getElementById('uploadAvatarBtnForm');
        this.avatarInputForm = document.getElementById('avatarInputForm');

        // In-dashboard profile settings form.
        this.profileForm = document.getElementById('profileEditForm');
        this.editFullName = document.getElementById('editFullName');
        this.editEmail = document.getElementById('editEmail');
        this.editLocation = document.getElementById('editLocation');
        this.editPhoneNumber = document.getElementById('editPhoneNumber');
        this.editFarmType = document.getElementById('editFarmType');
        this.editFarmSize = document.getElementById('editFarmSize');
        this.editSoilType = document.getElementById('editSoilType');
        this.editWaterSource = document.getElementById('editWaterSource');

        // Crop recommendation modal + result elements.
        this.startRecommendationBtn = document.getElementById('startRecommendationBtn');
        this.recommendationList = document.getElementById('recommendationList');
        this.recommendModal = document.getElementById('recommendModal');
        this.recommendModalBackdrop = document.getElementById('recommendModalBackdrop');
        this.recommendModalClose = document.getElementById('recommendModalClose');
        this.recommendForm = document.getElementById('recommendForm');
        this.recommendSubmitBtn = document.getElementById('recommendSubmitBtn');
        this.recommendSubmitText = this.recommendSubmitBtn?.querySelector('.btn-text');
        this.recommendSubmitLoader = this.recommendSubmitBtn?.querySelector('.btn-loader');

        // Feature inputs for /recommend-crop.
        this.recommendFields = {
            nitrogen: document.getElementById('nitrogenInput'),
            phosphorus: document.getElementById('phosphorusInput'),
            potassium: document.getElementById('potassiumInput'),
            temperature: document.getElementById('temperatureInput'),
            humidity: document.getElementById('humidityInput'),
            ph: document.getElementById('phInput'),
            rainfall: document.getElementById('rainfallInput')
        };

        // Price prediction modal + result elements.
        this.startPredictionBtn = document.getElementById('startPredictionBtn');
        this.predictionList = document.getElementById('predictionList');
        this.predictModal = document.getElementById('predictModal');
        this.predictModalBackdrop = document.getElementById('predictModalBackdrop');
        this.predictModalClose = document.getElementById('predictModalClose');
        this.predictForm = document.getElementById('predictForm');
        this.predictSubmitBtn = document.getElementById('predictSubmitBtn');
        this.predictSubmitText = this.predictSubmitBtn?.querySelector('.btn-text');
        this.predictSubmitLoader = this.predictSubmitBtn?.querySelector('.btn-loader');
        this.predictFields = {
            state: document.getElementById('stateInput'),
            LGA: document.getElementById('lgaInput'),
            market: document.getElementById('marketInput'),
            pricetype: document.getElementById('priceTypeInput'),
            category: document.getElementById('categoryInput'),
            commodity: document.getElementById('commodityInput'),
            unit: document.getElementById('unitInput'),
            quantity: document.getElementById('quantityInput'),
            date: document.getElementById('dateInput')
        };

        // Market analysis page elements.
        this.marketAnalysisForm = document.getElementById('marketAnalysisForm');
        this.marketAnalysisSubmitBtn = document.getElementById('marketAnalysisSubmitBtn');
        this.marketAnalysisSubmitText = this.marketAnalysisSubmitBtn?.querySelector('.btn-text');
        this.marketAnalysisSubmitLoader = this.marketAnalysisSubmitBtn?.querySelector('.btn-loader');
        this.marketAnalysisEmptyState = document.getElementById('marketAnalysisEmptyState');
        this.marketAnalysisContent = document.getElementById('marketAnalysisContent');
        this.marketAnalysisMetrics = document.getElementById('marketAnalysisMetrics');
        this.monthlyPriceChart = document.getElementById('monthlyPriceChart');
        this.statePriceChart = document.getElementById('statePriceChart');
        this.marketPriceChart = document.getElementById('marketPriceChart');
        this.marketAnalysisFields = {
            commodity: document.getElementById('marketAnalysisCommodity'),
            pricetype: document.getElementById('marketAnalysisPriceType'),
            year: document.getElementById('marketAnalysisYear'),
            unit: document.getElementById('marketAnalysisUnit')
        };

        // History page elements.
        this.historyRecommendationCount = document.getElementById('historyRecommendationCount');
        this.historyPredictionCount = document.getElementById('historyPredictionCount');
        this.historyRecommendationList = document.getElementById('historyRecommendationList');
        this.historyPredictionList = document.getElementById('historyPredictionList');
        this.historyRecommendationEmpty = document.getElementById('historyRecommendationEmpty');
        this.historyPredictionEmpty = document.getElementById('historyPredictionEmpty');

        // Delete account modal elements.
        this.deleteAccountBtn = document.getElementById('deleteAccountBtn');
        this.deleteModal = document.getElementById('deleteModal');
        this.deleteModalBackdrop = document.getElementById('deleteModalBackdrop');
        this.deleteCancelBtn = document.getElementById('deleteCancelBtn');
        this.deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
    }

    initPricePredictionModule() {
        this.stateToLgaMap = {
            Adamawa: ['Hong'],
            Borno: ['Biu', 'Damboa', 'Guzamala', 'Gwoza', 'Konduga', 'Mafa', 'Maiduguri', 'Shani', 'Kala', 'Magumeri', 'Ngala', 'Nganzai'],
            Jigawa: ['Maigatari', 'Kaugama'],
            Kaduna: ['Giwa', 'Lere'],
            Kano: ['Dawakin Tofa'],
            Katsina: ['Jibia', "Mai'Adua", 'Dandume'],
            Kebbi: ['Gwandu'],
            Lagos: ['Kosofe'],
            Oyo: ['Ibadan North'],
            Sokoto: ['Gada'],
            Yobe: ['Potiskum', 'Geidam', 'Nguru', 'Machina'],
            Zamfara: ['Kaura Namoda']
        };

        this.stateToMarketMap = {
            Adamawa: ['Mubi'],
            Borno: ['Biu', 'Damboa', 'Monguno', 'Gwoza Central', 'Bama', 'Konduga', 'Dikwa Central', 'Gamboru', 'Shani Main Market', 'Rann', 'Magumeri Central', 'Ngala', 'Gajiram'],
            Jigawa: ['Mai Gatari (CBM)', 'Gujungu'],
            Kaduna: ['Giwa', 'Saminaka'],
            Kano: ['Dawanau'],
            Katsina: ['Jibia (CBM)', 'Mai Adoua (CBM)', 'Dandume'],
            Kebbi: ['Gwandu'],
            Lagos: ['Sabo', 'Mushin', 'Balogun'],
            Oyo: ['Sango', 'Bodija', 'Oje'],
            Sokoto: ['Illela (CBM)'],
            Yobe: ['Potiskum', 'Geidam', 'Nguru', 'Machina Central'],
            Zamfara: ['Kaura Namoda']
        };

        this.categoryToCommodityMap = {
            'cereals and tubers': ['Maize', 'Millet', 'Sorghum', 'Rice (milled, local)', 'Rice (local)', 'Yam'],
            'oil and fats': ['Oil (palm)'],
            'pulses and nuts': ['Beans (niebe)', 'Cowpeas (brown)', 'Cowpeas (white)', 'Groundnuts (shelled)', 'Beans (white)', 'Beans (red)'],
            'vegetables and fruits': ['Bananas', 'Onions', 'Spinach', 'Tomatoes', 'Watermelons', 'Oranges']
        };

        this.commodityToUnitsMap = {
            'Oil (palm)': ['millilitres', 'liters'],
            Maize: ['kilograms'],
            Millet: ['kilograms'],
            Sorghum: ['kilograms'],
            'Beans (niebe)': ['kilograms'],
            'Rice (milled, local)': ['kilograms'],
            'Rice (local)': ['kilograms'],
            'Cowpeas (brown)': ['kilograms'],
            'Cowpeas (white)': ['kilograms'],
            Yam: ['kilograms'],
            'Groundnuts (shelled)': ['kilograms'],
            Bananas: ['kilograms'],
            Tomatoes: ['kilograms'],
            Watermelons: ['kilograms'],
            'Beans (white)': ['kilograms'],
            'Beans (red)': ['kilograms'],
            Spinach: ['grams'],
            Oranges: ['grams'],
            Onions: ['kilograms', 'grams']
        };

        this.priceTypeOptions = ['Wholesale', 'Retail'];
    }

    initMarketAnalysisModule() {
        this.marketAnalysisYears = [];
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= 2002; year -= 1) {
            this.marketAnalysisYears.push(String(year));
        }
    }

    bindTapHandler(element, handler) {
        if (!element) return;

        let suppressClick = false;
        const invoke = (event) => {
            if (event.type === 'touchend' || event.type === 'pointerup') {
                if (suppressClick) {
                    suppressClick = false;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                suppressClick = true;
                setTimeout(() => {
                    suppressClick = false;
                }, 260);
                event.preventDefault();
                event.stopPropagation();
                handler(event);
                return;
            }

            if (suppressClick) {
                suppressClick = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            handler(event);
        };

        element.addEventListener('click', invoke);
        if ('PointerEvent' in window) {
            element.addEventListener('pointerup', invoke, { passive: false });
        } else if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            element.addEventListener('touchend', invoke, { passive: false });
        }
    }

    bindEvents() {
        if (this.uploadBtn) {
            this.bindTapHandler(this.uploadBtn, () => this.avatarInput.click());
            this.avatarInput.addEventListener('change', (e) => this.uploadAvatar(e));
        }
        if (this.uploadBtnForm) {
            this.bindTapHandler(this.uploadBtnForm, () => this.avatarInputForm.click());
            this.avatarInputForm.addEventListener('change', (e) => this.uploadAvatar(e));
        }

        if (this.profileForm) {
            this.profileForm.addEventListener('submit', (e) => this.saveProfile(e));
        }

        if (this.deleteAccountBtn) {
            this.bindTapHandler(this.deleteAccountBtn, () => this.openDeleteModal());
        }
        if (this.deleteModalBackdrop) {
            this.deleteModalBackdrop.addEventListener('click', () => this.closeDeleteModal());
        }
        if (this.deleteCancelBtn) {
            this.deleteCancelBtn.addEventListener('click', () => this.closeDeleteModal());
        }
        if (this.deleteConfirmBtn) {
            this.deleteConfirmBtn.addEventListener('click', () => this.confirmDeleteAccount());
        }

        if (this.startRecommendationBtn) {
            this.bindTapHandler(this.startRecommendationBtn, () => this.openRecommendationModal());
        }
        if (this.recommendModalClose) {
            this.recommendModalClose.addEventListener('click', () => this.closeRecommendationModal());
        }
        if (this.recommendModalBackdrop) {
            this.recommendModalBackdrop.addEventListener('click', () => this.closeRecommendationModal());
        }
        if (this.recommendForm) {
            this.recommendForm.addEventListener('submit', (e) => this.submitRecommendationForm(e));
        }

        if (this.startPredictionBtn) {
            this.bindTapHandler(this.startPredictionBtn, () => this.openPredictionModal());
        }
        if (this.predictModalClose) {
            this.predictModalClose.addEventListener('click', () => this.closePredictionModal());
        }
        if (this.predictModalBackdrop) {
            this.predictModalBackdrop.addEventListener('click', () => this.closePredictionModal());
        }
        if (this.predictForm) {
            this.predictForm.addEventListener('submit', (e) => this.submitPredictionForm(e));
        }

        if (this.marketAnalysisForm) {
            this.marketAnalysisForm.addEventListener('submit', (e) => this.submitMarketAnalysisForm(e));
        }

        this.predictFields.state?.addEventListener('change', () => this.handleStateChange());
        this.predictFields.category?.addEventListener('change', () => this.handleCategoryChange());
        this.predictFields.commodity?.addEventListener('change', () => this.handleCommodityChange());
        this.marketAnalysisFields.commodity?.addEventListener('change', () => this.handleMarketAnalysisCommodityChange());
        Object.values(this.predictFields).forEach((field) => {
            if (!field) return;
            field.addEventListener('change', () => this.togglePredictSubmitState());
            field.addEventListener('input', () => this.togglePredictSubmitState());
        });
        Object.values(this.marketAnalysisFields).forEach((field) => {
            if (!field) return;
            field.addEventListener('change', () => this.toggleMarketAnalysisSubmitState());
            field.addEventListener('input', () => this.toggleMarketAnalysisSubmitState());
        });

        Object.keys(this.recommendFields).forEach((fieldKey) => {
            const input = this.recommendFields[fieldKey];
            if (!input) return;
            input.addEventListener('input', () => {
                this.validateRecommendationField(fieldKey);
                this.toggleRecommendSubmitState();
            });
            // Prevent non-numeric keyboard input.
            input.addEventListener('keydown', (event) => this.restrictNumericInput(event));
        });

        // Supports both sidebar links and dropdown profile item.
        document.querySelectorAll('[data-page]').forEach(link => {
            this.bindTapHandler(link, (e) => this.navigate(e));
        });

        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            this.bindTapHandler(btn, (e) => this.handleAction(e));
        });

        const logoutBtns = document.querySelectorAll('#logoutBtn, #dropdownLogout');
        logoutBtns.forEach(btn => {
            this.bindTapHandler(btn, (e) => this.logout(e));
        });

        window.addEventListener('beforeunload', () => {
            if (this.messageRotationTimer) clearInterval(this.messageRotationTimer);
        });
    }

    loadUserData() {
        const defaultData = {
            fullName: 'Farmer',
            email: '',
            location: '',
            phone: '',
            farmType: '',
            farmSize: '',
            soilType: '',
            waterSource: '',
            accountStatus: '',
            avatar: null
        };

        const stored = localStorage.getItem('agrosense_user');
        if (!stored) return defaultData;

        try {
            const parsed = JSON.parse(stored);
            const farmTypeMap = { crop: 'Crop Farming', livestock: 'Livestock', mixed: 'Mixed Farming' };
            const soilTypeMap = { clay: 'Clay', sandy: 'Sandy', silt: 'Silt', loam: 'Loam', chalky: 'Chalky' };
            const normalizedAvatar = parsed.avatar && String(parsed.avatar).startsWith('/uploads/')
                ? `${this.apiBaseUrl}${parsed.avatar}`
                : parsed.avatar;

            const normalized = {
                ...parsed,
                fullName: parsed.fullName || parsed.fullname,
                farmType: farmTypeMap[parsed.farmType] || parsed.farmType,
                soilType: soilTypeMap[parsed.soilType] || parsed.soilType,
                avatar: normalizedAvatar
            };

            return { ...defaultData, ...normalized };
        } catch (error) {
            return defaultData;
        }
    }

    saveUserData() {
        localStorage.setItem('agrosense_user', JSON.stringify(this.userData));
    }

    // Prevent unauthenticated users from seeing dashboard content.
    ensureAuthenticatedSession() {
        if (!this.token) {
            this.redirectToLogin();
            return false;
        }
        return true;
    }

    redirectToLogin() {
        localStorage.removeItem('agrosense_token');
        localStorage.removeItem('agrosense_user');
        window.location.href = 'login.html';
    }

    // GET /dashboard -> hydrate both summary cards and profile settings form.
    async refreshProfileFromApi() {
        try {
            if (!this.token) return;
            const payload = await this.request('/dashboard', { method: 'GET' });
            const user = payload?.user || {};
            const farm = payload?.farm_info || {};

            this.userData = {
                ...this.userData,
                fullName: user.name || this.userData.fullName,
                email: user.email || this.userData.email,
                location: user.location || '',
                phone: user.phone_number || '',
                farmType: farm.farm_type || '',
                farmSize: farm.farm_size ?? '',
                soilType: farm.soil_type || '',
                waterSource: farm.water_source || '',
                avatar: this.resolveAvatarUrl(user.profile_picture)
            };

            this.saveUserData();
            this.updateUI();
        } catch (error) {
            if (String(error.message || '').toLowerCase().includes('session expired')) {
                this.redirectToLogin();
                return;
            }
            this.showToast(error.message || 'Failed to load profile data', 'error');
        }
    }

    updateUI() {
        if (this.userNameSpan) this.userNameSpan.textContent = this.userData.fullName || 'Farmer';
        if (this.welcomeFarmerName) this.welcomeFarmerName.textContent = this.getFirstName(this.userData.fullName);
        this.renderFarmerDetails();
        this.updateAvatarUI();
        this.updateProfileForm();
    }

    // Keep form inputs in sync with currently loaded profile state.
    updateProfileForm() {
        if (this.editFullName) this.editFullName.value = this.userData.fullName || '';
        if (this.editEmail) this.editEmail.value = this.userData.email || '';
        if (this.editLocation) this.editLocation.value = this.userData.location || '';
        if (this.editPhoneNumber) this.editPhoneNumber.value = this.userData.phone || '';
        if (this.editFarmType) this.editFarmType.value = this.userData.farmType || '';
        if (this.editFarmSize) this.editFarmSize.value = this.userData.farmSize ?? '';
        if (this.editSoilType) this.editSoilType.value = this.userData.soilType || '';
        if (this.editWaterSource) this.editWaterSource.value = this.userData.waterSource || '';
    }

    openRecommendationModal() {
        if (!this.recommendModal) return;
        this.recommendModal.classList.remove('hidden');
        this.recommendModal.setAttribute('aria-hidden', 'false');
        this.toggleRecommendSubmitState();
    }

    closeRecommendationModal() {
        if (!this.recommendModal) return;
        this.recommendModal.classList.add('hidden');
        this.recommendModal.setAttribute('aria-hidden', 'true');
    }

    restrictNumericInput(event) {
        const allowedKeys = [
            'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End', 'Enter'
        ];
        if (allowedKeys.includes(event.key)) return;
        if (event.ctrlKey || event.metaKey) return;
        if (!/[\d.-]/.test(event.key)) {
            event.preventDefault();
        }
    }

    validateRecommendationField(fieldKey) {
        const input = this.recommendFields[fieldKey];
        const errorEl = document.getElementById(`${fieldKey}Error`);
        if (!input || !errorEl) return true;

        const value = input.value.trim();
        let error = '';

        if (!value) {
            error = 'This field is required.';
        } else if (Number.isNaN(Number(value))) {
            error = 'Only numeric values are allowed.';
        } else {
            const numericValue = Number(value);
            if ((fieldKey === 'humidity') && (numericValue < 0 || numericValue > 100)) {
                error = 'Humidity must be between 0 and 100.';
            }
            if ((fieldKey === 'ph') && (numericValue < 0 || numericValue > 14)) {
                error = 'Soil pH must be between 0 and 14.';
            }
            if ((fieldKey === 'nitrogen' || fieldKey === 'phosphorus' || fieldKey === 'potassium' || fieldKey === 'rainfall') && numericValue < 0) {
                error = 'Value cannot be negative.';
            }
        }

        errorEl.textContent = error;
        input.classList.toggle('invalid', Boolean(error));
        return !error;
    }

    toggleRecommendSubmitState() {
        if (!this.recommendSubmitBtn) return;
        const isValid = Object.keys(this.recommendFields).every((fieldKey) => this.validateRecommendationField(fieldKey));
        this.recommendSubmitBtn.disabled = !isValid;
    }

    setRecommendLoadingState(isLoading) {
        if (this.recommendSubmitBtn) this.recommendSubmitBtn.disabled = isLoading;
        if (this.recommendSubmitText) this.recommendSubmitText.classList.toggle('hidden', isLoading);
        if (this.recommendSubmitLoader) this.recommendSubmitLoader.classList.toggle('hidden', !isLoading);
    }

    async submitRecommendationForm(event) {
        event.preventDefault();
        this.toggleRecommendSubmitState();
        if (this.recommendSubmitBtn?.disabled) return;

        const payload = {
            nitrogen: Number(this.recommendFields.nitrogen.value),
            phosphorus: Number(this.recommendFields.phosphorus.value),
            potassium: Number(this.recommendFields.potassium.value),
            temperature: Number(this.recommendFields.temperature.value),
            humidity: Number(this.recommendFields.humidity.value),
            ph: Number(this.recommendFields.ph.value),
            rainfall: Number(this.recommendFields.rainfall.value)
        };

        this.setRecommendLoadingState(true);
        try {
            const response = await this.request('/recommend-crop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            this.renderRecommendationCard({
                features: payload,
                recommendedCrop: response?.recommended_crop,
                agroZone: response?.agro_zone,
                timeText: new Date().toLocaleString()
            });
            this.showToast('Recommendation generated successfully!', 'success');
            this.closeRecommendationModal();
            this.recommendForm.reset();
            Object.keys(this.recommendFields).forEach((fieldKey) => {
                const errorEl = document.getElementById(`${fieldKey}Error`);
                if (errorEl) errorEl.textContent = '';
                this.recommendFields[fieldKey].classList.remove('invalid');
            });
            this.toggleRecommendSubmitState();
        } catch (error) {
            this.showToast(error.message || 'Failed to generate recommendation. Please try again.', 'error');
        } finally {
            this.setRecommendLoadingState(false);
            this.toggleRecommendSubmitState();
        }
    }

    async loadRecommendationHistory() {
        if (this.recommendationHistoryLoaded || !this.recommendationList) return;
        try {
            const payload = await this.request('/recommend-crop/latest-session', { method: 'GET' });
            const latest = payload?.latest_recommendation || null;
            this.recommendationList.innerHTML = '';

            if (latest) {
                this.renderRecommendationCard(
                    {
                        features: latest.features || {},
                        recommendedCrop: latest.recommended_crop,
                        agroZone: latest.agro_zone,
                        timeText: 'Latest session'
                    },
                    { prepend: false }
                );
            }

            this.recommendationHistoryLoaded = true;
        } catch (error) {
            this.showToast(error.message || 'Failed to load recommendation history.', 'error');
        }
    }

    async loadPricePredictionHistory() {
        if (this.pricePredictionHistoryLoaded || !this.predictionList) return;
        try {
            const payload = await this.request('/predict-price/latest-session', { method: 'GET' });
            const latest = payload?.latest_prediction || null;
            this.predictionList.innerHTML = '';

            if (latest) {
                const features = latest.features || {};
                const fallbackDate = this.buildIsoDateFromParts(features.year, features.month, features.day);
                this.renderPredictionCard({
                    state: features.state,
                    LGA: features.LGA,
                    market: features.market,
                    pricetype: features.pricetype,
                    category: features.category,
                    commodity: features.commodity,
                    quantity: features.quantity,
                    unit: features.unit,
                    date: features.date || fallbackDate || '',
                    predictedPrice: latest.predicted_price,
                    timeText: 'Latest session'
                });
            }

            this.pricePredictionHistoryLoaded = true;
        } catch (error) {
            this.showToast(error.message || 'Failed to load price prediction history.', 'error');
        }
    }

    async loadFullHistoryPage() {
        if (this.historyPageLoaded || !this.historyRecommendationList || !this.historyPredictionList) return;

        try {
            const [recommendationPayload, predictionPayload] = await Promise.all([
                this.request('/recommend-crop/history', { method: 'GET' }),
                this.request('/predict-price/history', { method: 'GET' })
            ]);

            const recommendationHistory = recommendationPayload?.history || [];
            const predictionHistory = predictionPayload?.history || [];

            this.historyRecommendationList.innerHTML = '';
            this.historyPredictionList.innerHTML = '';

            if (this.historyRecommendationCount) {
                this.historyRecommendationCount.textContent = String(recommendationHistory.length);
            }
            if (this.historyPredictionCount) {
                this.historyPredictionCount.textContent = String(predictionHistory.length);
            }

            this.historyRecommendationEmpty?.classList.toggle('hidden', recommendationHistory.length > 0);
            this.historyPredictionEmpty?.classList.toggle('hidden', predictionHistory.length > 0);

            recommendationHistory.forEach((entry, index) => {
                this.renderRecommendationHistoryCard(entry, {
                    target: this.historyRecommendationList,
                    timeText: index === 0 ? 'Latest session' : `Session ${recommendationHistory.length - index}`
                });
            });

            predictionHistory.forEach((entry, index) => {
                const features = entry.features || {};
                const fallbackDate = this.buildIsoDateFromParts(features.year, features.month, features.day);
                this.renderPredictionHistoryCard({
                    state: features.state,
                    LGA: features.LGA,
                    market: features.market,
                    pricetype: features.pricetype,
                    category: features.category,
                    commodity: features.commodity,
                    quantity: features.quantity,
                    unit: features.unit,
                    date: features.date || fallbackDate || '',
                    predictedPrice: entry.predicted_price,
                    timeText: index === 0 ? 'Latest session' : `Session ${predictionHistory.length - index}`
                }, this.historyPredictionList);
            });

            this.historyPageLoaded = true;
        } catch (error) {
            this.showToast(error.message || 'Failed to load full history.', 'error');
        }
    }

    buildIsoDateFromParts(year, month, day) {
        if (!year || !month || !day) return '';

        const monthLookup = {
            january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
            july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
        };

        let monthNum = Number(month);
        if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
            monthNum = monthLookup[String(month).trim().toLowerCase()] || NaN;
        }
        if (!Number.isFinite(monthNum)) return '';

        const yyyy = Number(year);
        const dd = Number(day);
        if (!Number.isFinite(yyyy) || !Number.isFinite(dd)) return '';

        const mmText = String(monthNum).padStart(2, '0');
        const ddText = String(dd).padStart(2, '0');
        return `${yyyy}-${mmText}-${ddText}`;
    }

    renderRecommendationCard(cardData, options = {}) {
        if (!this.recommendationList) return;
        const { prepend = true } = options;
        const features = cardData?.features || {};
        const timeText = cardData?.timeText || new Date().toLocaleString();
        const recommendedCrop = cardData?.recommendedCrop || 'Unavailable';
        const agroZone = cardData?.agroZone || 'Unavailable';

        const featureRows = [
            { icon: 'fa-flask', label: 'Nitrogen', value: `${features.nitrogen} kg/ha` },
            { icon: 'fa-flask', label: 'Phosphorus', value: `${features.phosphorus} kg/ha` },
            { icon: 'fa-flask', label: 'Potassium', value: `${features.potassium} kg/ha` },
            { icon: 'fa-temperature-three-quarters', label: 'Temperature', value: `${features.temperature} deg C` },
            { icon: 'fa-cloud', label: 'Humidity', value: `${features.humidity}%` },
            { icon: 'fa-vial', label: 'Soil pH', value: `${features.ph}` },
            { icon: 'fa-cloud-rain', label: 'Rainfall', value: `${features.rainfall} mm` }
        ];

        const featuresHtml = featureRows.map((item) => `
            <div class="feature-chip">
                <i class="fas ${item.icon}"></i>
                <span><strong>${item.label}:</strong> ${item.value}</span>
            </div>
        `).join('');

        const card = document.createElement('article');
        card.className = 'recommendation-card';
        card.innerHTML = `
            <div class="recommendation-card-header">
                <div>
                    <div class="recommendation-card-title">
                        <i class="fas fa-seedling"></i>
                        <span>Recommendation Snapshot</span>
                    </div>
                    <p class="recommendation-card-sub">AI decision output from your latest feature set</p>
                </div>
                <span class="recommendation-card-time">${timeText}</span>
            </div>
            <hr class="recommendation-divider">
            <div class="recommendation-section-title">
                <i class="fas fa-sliders"></i>
                <span>Soil and Environmental Data</span>
            </div>
            <div class="recommendation-features">${featuresHtml}</div>
            <hr class="recommendation-divider">
            <div class="recommendation-section-title">
                <i class="fas fa-chart-line"></i>
                <span>Model Result</span>
            </div>
            <div class="recommendation-result">
                <div class="recommendation-result-label">
                    <i class="fas fa-leaf"></i>
                    <span>Recommended Crop</span>
                </div>
                <span class="recommendation-result-value">${recommendedCrop}</span>
            </div>
            <div class="recommendation-result recommendation-result-secondary">
                <div class="recommendation-result-label">
                    <i class="fas fa-map-location-dot"></i>
                    <span>Agro Zone</span>
                </div>
                <span class="recommendation-result-value">${agroZone}</span>
            </div>
        `;

        if (prepend) {
            this.recommendationList.prepend(card);
        } else {
            this.recommendationList.appendChild(card);
        }
    }

    openPredictionModal() {
        if (!this.predictModal) return;
        this.resetPredictionForm();
        this.allowFuturePredictionDates();
        this.seedPredictionFormOptions();
        this.predictModal.classList.remove('hidden');
        this.predictModal.setAttribute('aria-hidden', 'false');
        this.togglePredictSubmitState();
    }

    closePredictionModal() {
        if (!this.predictModal) return;
        this.predictModal.classList.add('hidden');
        this.predictModal.setAttribute('aria-hidden', 'true');
    }

    seedPredictionFormOptions() {
        const states = Object.keys(this.stateToLgaMap);
        const categories = Object.keys(this.categoryToCommodityMap);
        this.populateSelect(this.predictFields.state, states, 'Select state');
        this.populateSelect(this.predictFields.category, categories, 'Select category');
        this.populateSelect(this.predictFields.pricetype, this.priceTypeOptions, 'Select price type');
        this.resetSelect(this.predictFields.LGA, 'Select LGA');
        this.resetSelect(this.predictFields.market, 'Select market');
        this.resetSelect(this.predictFields.commodity, 'Select commodity');
        this.resetSelect(this.predictFields.unit, 'Select unit');
    }

    resetPredictionForm() {
        if (!this.predictForm) return;
        this.predictForm.reset();
        this.allowFuturePredictionDates();
        this.resetSelect(this.predictFields.LGA, 'Select LGA');
        this.resetSelect(this.predictFields.market, 'Select market');
        this.resetSelect(this.predictFields.commodity, 'Select commodity');
        this.resetSelect(this.predictFields.unit, 'Select unit');
    }

    allowFuturePredictionDates() {
        if (!this.predictFields.date) return;
        this.predictFields.date.removeAttribute('max');
    }

    populateSelect(selectEl, options, placeholder) {
        if (!selectEl) return;
        selectEl.innerHTML = '';

        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = placeholder;
        selectEl.appendChild(placeholderOption);

        options.forEach((option) => {
            const optionEl = document.createElement('option');
            optionEl.value = option;
            optionEl.textContent = option;
            selectEl.appendChild(optionEl);
        });

        selectEl.disabled = options.length === 0;
    }

    resetSelect(selectEl, placeholder) {
        this.populateSelect(selectEl, [], placeholder);
    }

    handleStateChange() {
        const state = this.predictFields.state?.value || '';
        const lgas = this.stateToLgaMap[state] || [];
        const markets = this.stateToMarketMap[state] || [];

        // Strict dependency reset: LGA and Market are cleared when State changes.
        this.populateSelect(this.predictFields.LGA, lgas, 'Select LGA');
        this.populateSelect(this.predictFields.market, markets, 'Select market');
        this.togglePredictSubmitState();
    }

    handleCategoryChange() {
        const category = this.predictFields.category?.value || '';
        const commodities = this.categoryToCommodityMap[category] || [];

        // Strict dependency reset: Commodity and Unit are cleared when Category changes.
        this.populateSelect(this.predictFields.commodity, commodities, 'Select commodity');
        this.resetSelect(this.predictFields.unit, 'Select unit');
        this.togglePredictSubmitState();
    }

    handleCommodityChange() {
        const commodity = this.predictFields.commodity?.value || '';
        const units = this.commodityToUnitsMap[commodity] || [];

        // Strict dependency reset: Unit is cleared when Commodity changes.
        this.populateSelect(this.predictFields.unit, units, 'Select unit');
        this.togglePredictSubmitState();
    }

    togglePredictSubmitState() {
        if (!this.predictSubmitBtn) return;
        const values = this.predictFields;
        const requiredValues = [
            values.state?.value,
            values.LGA?.value,
            values.market?.value,
            values.pricetype?.value,
            values.category?.value,
            values.commodity?.value,
            values.unit?.value,
            values.quantity?.value,
            values.date?.value
        ];
        const quantityValue = Number(values.quantity?.value || 0);
        const isValid = requiredValues.every((value) => Boolean(String(value || '').trim())) && quantityValue > 0;
        this.predictSubmitBtn.disabled = !isValid;
    }

    setPredictLoadingState(isLoading) {
        if (!this.predictSubmitBtn) return;
        this.predictSubmitBtn.disabled = isLoading || this.predictSubmitBtn.disabled;
        this.predictSubmitText?.classList.toggle('hidden', isLoading);
        this.predictSubmitLoader?.classList.toggle('hidden', !isLoading);
    }

    formatDateToMonth(dateValue) {
        const parsedDate = new Date(`${dateValue}T00:00:00`);
        const month = parsedDate.toLocaleString('en-US', { month: 'long' });
        return month.charAt(0).toUpperCase() + month.slice(1);
    }

    async submitPredictionForm(event) {
        event.preventDefault();
        this.togglePredictSubmitState();
        if (this.predictSubmitBtn?.disabled) return;

        const dateValue = this.predictFields.date.value;
        const parsedDate = new Date(`${dateValue}T00:00:00`);
        const month = this.formatDateToMonth(dateValue);

        const payload = {
            state: this.predictFields.state.value,
            LGA: this.predictFields.LGA.value,
            market: this.predictFields.market.value,
            pricetype: this.predictFields.pricetype.value,
            category: this.predictFields.category.value,
            commodity: this.predictFields.commodity.value,
            quantity: Number(this.predictFields.quantity.value),
            unit: this.predictFields.unit.value,
            date: dateValue,
            year: parsedDate.getFullYear(),
            month,
            day: parsedDate.getDate()
        };

        this.setPredictLoadingState(true);
        try {
            const response = await this.request('/predict-price', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            this.renderPredictionCard({
                ...payload,
                predictedPrice: response?.predicted_price,
                timeText: new Date().toLocaleString()
            });
            this.showToast('Price prediction generated successfully!', 'success');
            this.closePredictionModal();
        } catch (error) {
            this.showToast(error.message || 'Price prediction failed. Please try again.', 'error');
            window.alert(error.message || 'Price prediction failed. Please check your inputs and try again.');
        } finally {
            this.setPredictLoadingState(false);
            this.togglePredictSubmitState();
        }
    }

    renderPredictionCard(cardData) {
        if (!this.predictionList) return;
        const predictedPrice = Number(cardData?.predictedPrice || 0);
        const formattedPrice = Number.isFinite(predictedPrice)
            ? `\u20A6 ${predictedPrice.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
            : '\u20A6 0';

        const featureRows = [
            { icon: 'fa-location-dot', label: 'State', value: cardData.state },
            { icon: 'fa-map', label: 'LGA', value: cardData.LGA },
            { icon: 'fa-store', label: 'Market', value: cardData.market },
            { icon: 'fa-tags', label: 'Price Type', value: cardData.pricetype },
            { icon: 'fa-layer-group', label: 'Category', value: cardData.category },
            { icon: 'fa-wheat-awn', label: 'Commodity', value: cardData.commodity },
            { icon: 'fa-scale-balanced', label: 'Trade Unit', value: `${cardData.quantity} ${cardData.unit}` },
            { icon: 'fa-calendar-days', label: 'Date', value: cardData.date || '-' }
        ];

        const featuresHtml = featureRows.map((item) => `
            <div class="feature-chip">
                <i class="fas ${item.icon}"></i>
                <span><strong>${item.label}:</strong> ${item.value}</span>
            </div>
        `).join('');

        const card = document.createElement('article');
        card.className = 'prediction-card';
        card.innerHTML = `
            <div class="prediction-card-header">
                <div>
                    <div class="prediction-card-title">
                        <i class="fas fa-chart-line"></i>
                        <span>Price Prediction Snapshot</span>
                    </div>
                    <p class="prediction-card-sub">Market forecast generated from your selected features</p>
                </div>
                <span class="recommendation-card-time">${cardData.timeText}</span>
            </div>
            <hr class="recommendation-divider">
            <div class="prediction-features">${featuresHtml}</div>
            <div class="prediction-result">
                <div class="prediction-result-label">
                    <span>Predicted Price</span>
                </div>
                <span class="prediction-result-value">${formattedPrice}</span>
            </div>
        `;

        // Keep previous prediction sessions visible.
        this.predictionList.appendChild(card);
    }

    renderPredictionHistoryCard(cardData, target) {
        if (!target) return;
        const predictedPrice = Number(cardData?.predictedPrice || 0);
        const formattedPrice = Number.isFinite(predictedPrice)
            ? `₦ ${predictedPrice.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
            : '₦ 0';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="State">${cardData.state || '-'}</td>
            <td data-label="LGA">${cardData.LGA || '-'}</td>
            <td data-label="Market">${cardData.market || '-'}</td>
            <td data-label="Price Type">${cardData.pricetype || '-'}</td>
            <td data-label="Category">${cardData.category || '-'}</td>
            <td data-label="Commodity">${cardData.commodity || '-'}</td>
            <td data-label="Quantity">${cardData.quantity ?? '-'}</td>
            <td data-label="Unit">${cardData.unit || '-'}</td>
            <td data-label="Forecast Date">${cardData.date || 'Date unavailable'}</td>
            <td data-label="Predicted Price">${formattedPrice}</td>
        `;

        target.appendChild(row);
    }

    ensureMarketAnalysisPageReady() {
        if (this.marketAnalysisInitialized) return;
        this.seedMarketAnalysisFormOptions();
        this.renderMarketAnalysisEmptyState(
            'Run a market analysis',
            'Your result cards and price charts will appear here after you submit the filters.'
        );
        this.marketAnalysisInitialized = true;
    }

    seedMarketAnalysisFormOptions() {
        const commodities = Object.keys(this.commodityToUnitsMap).sort((a, b) => a.localeCompare(b));
        this.populateSelect(this.marketAnalysisFields.commodity, commodities, 'Select commodity');
        this.populateSelect(this.marketAnalysisFields.pricetype, this.priceTypeOptions, 'Select price type');
        this.populateSelect(this.marketAnalysisFields.year, this.marketAnalysisYears, 'Select year');
        this.resetSelect(this.marketAnalysisFields.unit, 'Select unit');
        this.toggleMarketAnalysisSubmitState();
    }

    handleMarketAnalysisCommodityChange() {
        const commodity = this.marketAnalysisFields.commodity?.value || '';
        const units = this.commodityToUnitsMap[commodity] || [];
        this.populateSelect(this.marketAnalysisFields.unit, units, 'Select unit');
        this.toggleMarketAnalysisSubmitState();
    }

    toggleMarketAnalysisSubmitState() {
        if (!this.marketAnalysisSubmitBtn) return;
        const requiredValues = [
            this.marketAnalysisFields.commodity?.value,
            this.marketAnalysisFields.pricetype?.value,
            this.marketAnalysisFields.year?.value,
            this.marketAnalysisFields.unit?.value
        ];
        const isValid = requiredValues.every((value) => Boolean(String(value || '').trim()));
        this.marketAnalysisSubmitBtn.disabled = !isValid;
    }

    setMarketAnalysisLoadingState(isLoading) {
        if (!this.marketAnalysisSubmitBtn) return;
        this.marketAnalysisSubmitBtn.disabled = isLoading || this.marketAnalysisSubmitBtn.disabled;
        this.marketAnalysisSubmitText?.classList.toggle('hidden', isLoading);
        this.marketAnalysisSubmitLoader?.classList.toggle('hidden', !isLoading);
    }

    async submitMarketAnalysisForm(event) {
        event.preventDefault();
        this.toggleMarketAnalysisSubmitState();
        if (this.marketAnalysisSubmitBtn?.disabled) return;

        const payload = {
            commodity: this.marketAnalysisFields.commodity.value,
            pricetype: this.marketAnalysisFields.pricetype.value,
            year: Number(this.marketAnalysisFields.year.value),
            unit: this.marketAnalysisFields.unit.value
        };

        this.setMarketAnalysisLoadingState(true);
        try {
            const response = await this.request('/market-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            this.renderMarketAnalysis(response);
            this.showToast('Market analysis generated successfully!', 'success');
        } catch (error) {
            this.renderMarketAnalysisEmptyState(
                'No analysis available',
                error.message || 'Market analysis could not be generated for the selected filters.'
            );
            this.showToast(error.message || 'Market analysis failed. Please try again.', 'error');
        } finally {
            this.setMarketAnalysisLoadingState(false);
            this.toggleMarketAnalysisSubmitState();
        }
    }

    renderMarketAnalysis(response) {
        if (!this.marketAnalysisMetrics || !this.monthlyPriceChart || !this.statePriceChart || !this.marketPriceChart) return;

        const summaryCards = [
            { label: 'Commodity', value: response?.commodity || 'N/A' },
            { label: 'Price Type', value: response?.pricetype || 'N/A' },
            { label: 'Year', value: response?.year || 'N/A' },
            { label: 'Total Markets', value: this.formatNumber(response?.total_markets) }
        ];

        this.marketAnalysisMetrics.innerHTML = summaryCards.map((item) => `
            <article class="market-analysis-metric">
                <span class="market-analysis-metric-label">${item.label}</span>
                <span class="market-analysis-metric-value">${item.value}</span>
            </article>
        `).join('');

        this.renderMonthlyChart(this.monthlyPriceChart, response?.average_price_per_month || []);
        this.renderHorizontalBarChart(this.statePriceChart, response?.average_price_across_states || [], {
            labelKey: 'state',
            scrollable: false
        });
        this.renderHorizontalBarChart(this.marketPriceChart, response?.average_price_across_markets || [], {
            labelKey: 'market',
            secondaryLabelKey: 'state',
            scrollable: true
        });

        this.marketAnalysisEmptyState?.classList.add('hidden');
        this.marketAnalysisContent?.classList.remove('hidden');
    }

    renderMarketAnalysisEmptyState(title, message) {
        if (this.marketAnalysisEmptyState) {
            this.marketAnalysisEmptyState.innerHTML = `
                <div class="placeholder-icon">
                    <i class="fas fa-chart-simple"></i>
                </div>
                <h3>${title}</h3>
                <p>${message}</p>
            `;
            this.marketAnalysisEmptyState.classList.remove('hidden');
        }

        this.marketAnalysisContent?.classList.add('hidden');
        if (this.marketAnalysisMetrics) this.marketAnalysisMetrics.innerHTML = '';
        if (this.monthlyPriceChart) this.monthlyPriceChart.innerHTML = '';
        if (this.statePriceChart) this.statePriceChart.innerHTML = '';
        if (this.marketPriceChart) this.marketPriceChart.innerHTML = '';
    }

    renderMonthlyChart(container, items) {
        if (!container) return;
        if (!items.length) {
            container.innerHTML = '<div class="market-chart-empty">No monthly average price data available for this filter.</div>';
            return;
        }

        const maxValue = Math.max(...items.map((item) => Number(item.average_price) || 0), 1);
        container.innerHTML = `
            <div class="market-month-chart">
                ${items.map((item) => {
                    const value = Number(item.average_price) || 0;
                    const height = Math.max((value / maxValue) * 100, 8);
                    const label = String(item.month || '').slice(0, 3);
                    return `
                        <div class="market-month-bar">
                            <span class="market-month-bar-value">${this.formatCurrency(value)}</span>
                            <div class="market-month-bar-track">
                                <div class="market-month-bar-fill" style="height: ${height}%"></div>
                            </div>
                            <span class="market-month-bar-label">${label}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderHorizontalBarChart(container, items, options = {}) {
        if (!container) return;
        if (!items.length) {
            container.innerHTML = '<div class="market-chart-empty">No price comparison data available for this filter.</div>';
            return;
        }

        const { labelKey, secondaryLabelKey = '', scrollable = false } = options;
        const maxValue = Math.max(...items.map((item) => Number(item.average_price) || 0), 1);
        const chartClass = scrollable ? 'market-list-chart market-scrollable' : 'market-list-chart';

        container.innerHTML = `
            <div class="${chartClass}">
                ${items.map((item) => {
                    const value = Number(item.average_price) || 0;
                    const width = Math.max((value / maxValue) * 100, 4);
                    const primary = item?.[labelKey] || 'Unknown';
                    const secondary = secondaryLabelKey ? item?.[secondaryLabelKey] : '';
                    const label = secondary ? `${primary} (${secondary})` : primary;
                    return `
                        <div class="market-list-row">
                            <span class="market-list-label">${label}</span>
                            <div class="market-list-track">
                                <div class="market-list-fill" style="width: ${width}%"></div>
                            </div>
                            <span class="market-list-value">${this.formatCurrency(value)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    formatCurrency(value) {
        const amount = Number(value || 0);
        return `₦ ${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
    }

    formatNumber(value) {
        const amount = Number(value || 0);
        return amount.toLocaleString('en-NG');
    }

    initDynamicWelcomeMessage() {
        if (!this.dynamicWelcomeMessage) return;

        const dynamicMessages = [
            'Review your profile data before starting new recommendations.',
            'Use crop recommendations together with price prediction for stronger planning.',
            'Check market analysis before harvest scheduling to improve timing.',
            'Keep your farm details current so model outputs stay relevant.',
            'Track history weekly to identify high-performing crop cycles.'
        ];

        const applyMessage = (message) => {
            this.dynamicWelcomeMessage.classList.add('message-switching');
            setTimeout(() => {
                this.dynamicWelcomeMessage.textContent = message;
                this.dynamicWelcomeMessage.classList.remove('message-switching');
            }, 180);
        };

        applyMessage(dynamicMessages[this.dynamicMessageIndex]);

        if (this.messageRotationTimer) clearInterval(this.messageRotationTimer);
        this.messageRotationTimer = setInterval(() => {
            this.dynamicMessageIndex = (this.dynamicMessageIndex + 1) % dynamicMessages.length;
            applyMessage(dynamicMessages[this.dynamicMessageIndex]);
        }, 4200);
    }

    getFirstName(fullName) {
        const normalized = (fullName || '').trim();
        if (!normalized) return 'Farmer';
        return normalized.split(' ')[0];
    }

    renderFarmerDetails() {
        if (!this.farmerDetailsList) return;

        const details = [
            { key: 'fullName', label: 'Full Name', icon: 'fa-user' },
            { key: 'email', label: 'Email Address', icon: 'fa-envelope' },
            { key: 'location', label: 'Location', icon: 'fa-location-dot' },
            { key: 'farmType', label: 'Farm Type', icon: 'fa-tractor' },
            { key: 'farmSize', label: 'Farm Size', icon: 'fa-ruler-combined' },
            { key: 'soilType', label: 'Soil Type', icon: 'fa-globe' },
            { key: 'waterSource', label: 'Water Source', icon: 'fa-droplet' },
            { key: 'accountStatus', label: 'Account Status', icon: 'fa-circle-check' }
        ];

        const chunkSize = 4;
        const columns = [];

        for (let i = 0; i < details.length; i += chunkSize) {
            const chunk = details.slice(i, i + chunkSize);
            const cards = chunk.map(detail => {
                const value = this.formatDetailValue(detail.key, this.userData[detail.key]);
                return `
                    <div class="info-item">
                        <div class="info-head">
                            <span class="info-icon"><i class="fas ${detail.icon}"></i></span>
                            <span class="info-label">${detail.label}</span>
                        </div>
                        <span class="info-value">${value}</span>
                    </div>
                `;
            }).join('');

            columns.push(`<div class="info-column">${cards}</div>`);
        }

        this.farmerDetailsList.innerHTML = columns.join('');
    }

    formatDetailValue(key, rawValue) {
        const value = rawValue ?? '';
        if (!String(value).trim()) return 'Not provided';

        if (key === 'farmSize') return `${value} hectares`;
        if (typeof value === 'string' && key !== 'email') {
            return value
                .split(' ')
                .filter(Boolean)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        return value;
    }

    updateAvatarUI() {
        if (this.userData.avatar) {
            const avatarImg = `<img src="${this.userData.avatar}" alt="Profile">`;
            if (this.profileAvatarLarge) this.profileAvatarLarge.innerHTML = avatarImg;
            if (this.profileAvatarLargeForm) this.profileAvatarLargeForm.innerHTML = avatarImg;
            return;
        }

        const initial = (this.userData.fullName || 'Farmer').trim().charAt(0).toUpperCase() || 'F';
        if (this.profileAvatarLarge) this.profileAvatarLarge.innerHTML = `<span>${initial}</span>`;
        if (this.profileAvatarLargeForm) this.profileAvatarLargeForm.innerHTML = `<span>${initial}</span>`;
    }

    // POST /upload-profile-picture
    async uploadAvatar(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showToast('Please select an image file', 'error');
            return;
        }

        try {
            if (!this.token) throw new Error('Please login again to upload your profile image');

            const formData = new FormData();
            formData.append('profile_picture', file);

            const response = await fetch(`${this.apiBaseUrl}/upload-profile-picture`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`
                },
                body: formData
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.detail || 'Profile image upload failed');
            }

            this.userData.avatar = this.resolveAvatarUrl(payload?.profile_picture);
            this.saveUserData();
            this.updateAvatarUI();
            this.showToast('Profile picture updated successfully!', 'success');
        } catch (error) {
            this.showToast(error.message || 'Profile image upload failed', 'error');
        } finally {
            if (this.avatarInput) this.avatarInput.value = '';
            if (this.avatarInputForm) this.avatarInputForm.value = '';
        }
    }

    // PUT /update-profile
    async saveProfile(event) {
        event.preventDefault();

        // Build payload to match backend ProfileUpdate:
        // - Do not send empty strings for optional fields.
        // - Send only provided values so backend updates safely.
        const payload = {};
        const fullName = this.editFullName?.value.trim() || '';
        const location = this.editLocation?.value.trim() || '';
        const phoneNumber = this.editPhoneNumber?.value.trim() || '';
        const farmType = this.editFarmType?.value || '';
        const farmSizeRaw = this.editFarmSize?.value || '';
        const soilType = this.editSoilType?.value || '';
        const waterSource = this.editWaterSource?.value || '';

        if (!fullName) {
            this.showToast('Full name is required', 'error');
            return;
        }

        if (phoneNumber && !/^\+234\d{10}$/.test(phoneNumber)) {
            this.showToast('Phone number must be in format +234XXXXXXXXXX', 'error');
            return;
        }

        if (farmSizeRaw && Number(farmSizeRaw) <= 0) {
            this.showToast('Farm size must be greater than 0', 'error');
            return;
        }

        payload.name = fullName;
        payload.location = location;
        if (phoneNumber) payload.phone_number = phoneNumber;
        if (farmType) payload.farm_type = farmType;
        if (farmSizeRaw) payload.farm_size = Number(farmSizeRaw);
        if (soilType) payload.soil_type = soilType;
        if (waterSource) payload.water_source = waterSource;

        try {
            const response = await this.request('/update-profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const user = response?.user || {};
            const farm = response?.farm_info || {};

            this.userData = {
                ...this.userData,
                fullName: user.name || fullName,
                email: user.email || this.userData.email,
                location: user.location || location,
                phone: user.phone_number || phoneNumber || this.userData.phone,
                farmType: farm.farm_type || farmType || this.userData.farmType,
                farmSize: farm.farm_size ?? (farmSizeRaw ? Number(farmSizeRaw) : this.userData.farmSize),
                soilType: farm.soil_type || soilType || this.userData.soilType,
                waterSource: farm.water_source || waterSource || this.userData.waterSource
            };

            this.saveUserData();
            this.updateUI();
            this.showToast('Profile updated successfully!', 'success');
            this.showPage('dashboard');
            this.setActiveSidebarItem('dashboard');
        } catch (error) {
            this.showToast(error.message || 'Profile update failed', 'error');
        }
    }

    navigate(event) {
        event.preventDefault();
        const page = event.currentTarget.getAttribute('data-page');
        this.showPage(page);
        this.setActiveSidebarItem(page);

        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }

        const sidebarBackdrop = document.getElementById('sidebarBackdrop');
        if (sidebarBackdrop && sidebarBackdrop.classList.contains('show')) {
            sidebarBackdrop.classList.remove('show');
        }
    }

    renderRecommendationHistoryCard(cardData, options = {}) {
        if (!options.target) return;
        const features = cardData?.features || {};
        const recommendedCrop = cardData?.recommended_crop || 'Unavailable';
        const agroZone = cardData?.agro_zone || 'Unavailable';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="Recommended Crop">${recommendedCrop}</td>
            <td data-label="Agro Zone">${agroZone}</td>
            <td data-label="Nitrogen (kg/ha)">${features.nitrogen ?? '-'}</td>
            <td data-label="Phosphorus (kg/ha)">${features.phosphorus ?? '-'}</td>
            <td data-label="Potassium (kg/ha)">${features.potassium ?? '-'}</td>
            <td data-label="Temperature (deg C)">${features.temperature ?? '-'}</td>
            <td data-label="Humidity (%)">${features.humidity ?? '-'}</td>
            <td data-label="Soil pH">${features.ph ?? '-'}</td>
            <td data-label="Rainfall (mm)">${features.rainfall ?? '-'}</td>
            <td data-label="Date">${cardData.created_at ? new Date(cardData.created_at).toLocaleDateString('en-GB') : '-'}</td>
        `;

        options.target.appendChild(row);
    }

    showPage(pageId) {
        document.querySelectorAll('.content-page').forEach(page => {
            page.classList.remove('active');
        });

        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) targetPage.classList.add('active');

        if (pageId === 'profile') this.updateProfileForm();
        if (pageId === 'market-analysis') this.ensureMarketAnalysisPageReady();
        if (pageId === 'history') this.loadFullHistoryPage();
    }

    handleAction(event) {
        const btn = event.currentTarget;
        const action = btn.getAttribute('data-action');

        if (action) {
            this.showPage(action);
            this.setActiveSidebarItem(action);
            this.showToast(`Let's get started with ${action.replace('-', ' ')}!`, 'info');
        }
    }

    setActiveSidebarItem(page) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        const target = document.querySelector(`.nav-link[data-page="${page}"]`);
        target?.closest('.nav-item')?.classList.add('active');
    }

    logout(event) {
        event.preventDefault();
        this.showToast('Logging out...', 'info');
        setTimeout(() => {
            localStorage.removeItem('agrosense_token');
            localStorage.removeItem('agrosense_user');
            window.location.href = 'login.html';
        }, 1000);
    }

    openDeleteModal() {
        if (this.deleteModal) {
            this.deleteModal.classList.remove('hidden');
            this.deleteModal.setAttribute('aria-hidden', 'false');
        }
    }

    closeDeleteModal() {
        if (this.deleteModal) {
            this.deleteModal.classList.add('hidden');
            this.deleteModal.setAttribute('aria-hidden', 'true');
        }
    }

    async confirmDeleteAccount() {
        try {
            this.deleteConfirmBtn.disabled = true;
            this.deleteConfirmBtn.textContent = 'Deleting...';

            const response = await fetch(`${this.apiBaseUrl}/delete-account`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to delete account');
            }

            this.showToast('Account deleted successfully. Redirecting...', 'success');
            
            setTimeout(() => {
                localStorage.removeItem('agrosense_token');
                localStorage.removeItem('agrosense_user');
                window.location.href = 'login.html';
            }, 1500);

        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
            this.deleteConfirmBtn.disabled = false;
            this.deleteConfirmBtn.textContent = 'Delete My Account';
        }
    }

    initSidebar() {
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const sidebarClose = document.getElementById('sidebarClose');
        const sidebarBackdrop = document.getElementById('sidebarBackdrop');

        const openSidebar = () => {
            sidebar.classList.add('open');
            sidebarBackdrop?.classList.add('show');
        };

        const closeSidebar = () => {
            sidebar.classList.remove('open');
            sidebarBackdrop?.classList.remove('show');
        };

        if (menuToggle) {
            this.bindTapHandler(menuToggle, () => {
                if (sidebar.classList.contains('open')) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
        }

        if (sidebarClose) {
            this.bindTapHandler(sidebarClose, () => {
                closeSidebar();
            });
        }

        if (sidebarBackdrop) {
            this.bindTapHandler(sidebarBackdrop, () => {
                closeSidebar();
            });
        }

        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) && !menuToggle?.contains(e.target) && sidebar.classList.contains('open')) {
                closeSidebar();
            }
        }, true);
    }

    initUserDropdown() {
        const userDropdown = document.getElementById('userDropdown');

        if (userDropdown) {
            userDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('active');
            });

            document.addEventListener('click', () => {
                userDropdown.classList.remove('active');
            });
        }
    }

    resolveAvatarUrl(path) {
        if (!path) return null;
        return String(path).startsWith('http') ? path : `${this.apiBaseUrl}${path}`;
    }

    async request(path, options = {}) {
        if (!this.token) {
            this.redirectToLogin();
            throw new Error('Session expired. Please login again.');
        }

        const response = await fetch(`${this.apiBaseUrl}${path}`, {
            ...options,
            headers: {
                ...(options.headers || {}),
                Authorization: `Bearer ${this.token}`
            }
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401) {
                this.redirectToLogin();
                throw new Error('Session expired. Please login again.');
            }
            throw new Error(payload?.detail || payload?.message || 'Request failed');
        }

        return payload;
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = type === 'success' ? 'fa-check-circle' :
                     type === 'error' ? 'fa-exclamation-circle' :
                     'fa-info-circle';

        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <div class="toast-content">${message}</div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;

        container.appendChild(toast);

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => toast.remove());

        setTimeout(() => toast.remove(), 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new DashboardManager();
});
