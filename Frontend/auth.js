/* auth.js - Authentication Logic for AgroSense */
class AuthManager {
    // Production switch:
    // Replace the fallback URL below with your deployed backend URL, e.g.:
    // static API_BASE_URL = 'https://your-api-domain.com';
    // You can also set window.AGROSENSE_API_BASE_URL before auth.js loads.
    static API_BASE_URL = window.AGROSENSE_API_BASE_URL || 'https://smart-agricultural-dss-production-5dd9.up.railway.app';

    static buildUrl(path, query = {}) {
        const url = new URL(path, this.API_BASE_URL);
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, String(value));
            }
        });
        return url.toString();
    }

    static async request(path, options = {}) {
        const response = await fetch(this.buildUrl(path), {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            const message = payload?.detail || payload?.message || 'Request failed';
            throw new Error(message);
        }

        return payload;
    }

    static async loginRequest(email, password) {
        const url = this.buildUrl('/login', { email, password });
        const response = await fetch(url, { method: 'POST' });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.detail || payload?.message || 'Login failed');
        }
        return payload;
    }

    static async signupRequest(data) {
        const url = this.buildUrl('/signup', data);
        const response = await fetch(url, { method: 'POST' });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.detail || payload?.message || 'Signup failed');
        }
        return payload;
    }

    // Sends a social login request to the backend.
    // The backend will create or reuse a placeholder account for the provider.
    static async socialLoginRequest(provider) {
        const url = this.buildUrl('/social-login');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ provider })
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            throw new Error(payload?.detail || payload?.message || 'Social login failed');
        }
        return payload;
    }

    // Initiates real OAuth flow by redirecting to the backend OAuth endpoint.
    // The backend will redirect to the provider's OAuth page.
    static initiateOAuth(provider) {
        const oauthUrl = this.buildUrl(`/auth/${provider}`);
        window.location.href = oauthUrl;
    }

    static async fetchDashboardProfile(token) {
        const response = await fetch(this.buildUrl('/dashboard'), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.detail || payload?.message || 'Failed to fetch dashboard profile');
        }
        return payload;
    }

    static saveAuthState({ token, user, farmInfo }) {
        const avatarUrl = user?.profile_picture
            ? (String(user.profile_picture).startsWith('http')
                ? user.profile_picture
                : `${this.API_BASE_URL}${user.profile_picture}`)
            : null;

        localStorage.setItem('agrosense_token', token);
        localStorage.setItem('agrosense_user', JSON.stringify({
            fullName: user?.name || '',
            email: user?.email || '',
            location: user?.location || '',
            phone: user?.phone_number || 'Not provided',
            farmType: farmInfo?.farm_type || '',
            farmSize: farmInfo?.farm_size ?? '',
            soilType: farmInfo?.soil_type || '',
            waterSource: farmInfo?.water_source || 'Rain-fed',
            accountStatus: 'Active',
            avatar: avatarUrl
        }));
    }

    static initLogin() {
        const form = document.getElementById('loginForm');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const submitBtn = document.getElementById('loginBtnSubmit');
        const toggleBtns = form?.querySelectorAll('.toggle-password') || [];

        // Initialize password toggles and social authentication buttons.
        this.initPasswordToggles(toggleBtns);
        this.initSocialButtons();

        if (form) {
            form.addEventListener('submit', (e) => this.handleLogin(e, emailInput, passwordInput, submitBtn));
        }
    }

    static initSignup() {
        const form = document.getElementById('signupForm');
        const passwordInput = document.getElementById('signup-password');
        const submitBtn = document.getElementById('signupBtnSubmit');
        const toggleBtns = form?.querySelectorAll('.toggle-password') || [];
        const nextBtn = document.getElementById('signupNextBtn');
        const backBtn = document.getElementById('signupBackBtn');

        this.initPasswordToggles(toggleBtns);
        this.initSocialButtons();
        this.setSignupStep(1);

        // Password strength indicator
        if (passwordInput) {
            passwordInput.addEventListener('input', () => this.updatePasswordStrength(passwordInput.value));
        }

        nextBtn?.addEventListener('click', () => this.advanceSignupStep());
        backBtn?.addEventListener('click', () => this.setSignupStep(1));

        if (form) {
            form.addEventListener('submit', (e) => this.handleSignup(e, submitBtn));
        }
    }

    static setSignupStep(step) {
        const stepOne = document.getElementById('signupStepOne');
        const stepTwo = document.getElementById('signupStepTwo');
        const pill = document.getElementById('signupStepPill');
        const progressOne = document.getElementById('signupProgressOne');
        const progressTwo = document.getElementById('signupProgressTwo');

        if (!stepOne || !stepTwo) return;

        const onFirstStep = step === 1;
        stepOne.classList.toggle('is-active', onFirstStep);
        stepTwo.classList.toggle('is-active', !onFirstStep);

        if (pill) pill.textContent = onFirstStep ? 'Step 1 of 2' : 'Step 2 of 2';
        progressOne?.classList.add('is-active');
        progressTwo?.classList.toggle('is-active', !onFirstStep);
    }

    static advanceSignupStep() {
        const fields = {
            fullname: document.getElementById('fullname'),
            email: document.getElementById('signup-email'),
            password: document.getElementById('signup-password'),
            confirmPassword: document.getElementById('confirm-password')
        };

        ['fullnameError', 'signupEmailError', 'signupPasswordError', 'confirmPasswordError'].forEach((id) => {
            this.clearError(id);
        });

        let isValid = true;

        if (!fields.fullname?.value.trim()) {
            this.showError('fullnameError', 'Full name is required');
            isValid = false;
        }

        const email = fields.email?.value.trim() || '';
        if (!email) {
            this.showError('signupEmailError', 'Email is required');
            isValid = false;
        } else if (!this.validateEmail(email)) {
            this.showError('signupEmailError', 'Please enter a valid email address');
            isValid = false;
        }

        const password = fields.password?.value || '';
        if (!password) {
            this.showError('signupPasswordError', 'Password is required');
            isValid = false;
        } else if (!this.validatePassword(password)) {
            this.showError('signupPasswordError', 'Password must be at least 6 characters');
            isValid = false;
        }

        if (!fields.confirmPassword?.value) {
            this.showError('confirmPasswordError', 'Please confirm your password');
            isValid = false;
        } else if (fields.confirmPassword.value !== password) {
            this.showError('confirmPasswordError', 'Passwords do not match');
            isValid = false;
        }

        if (!isValid) return;
        this.setSignupStep(2);
    }

    static initPasswordToggles(buttons) {
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const input = targetId ? document.getElementById(targetId) : btn.parentElement.querySelector('input');
                if (input) {
                    const type = input.type === 'password' ? 'text' : 'password';
                    input.type = type;
                    btn.querySelector('i').classList.toggle('fa-eye');
                    btn.querySelector('i').classList.toggle('fa-eye-slash');
                }
            });
        });
    }

    static updatePasswordStrength(password) {
        const strengthBar = document.querySelector('.strength-bar');
        const strengthText = document.querySelector('.strength-text');
        
        if (!strengthBar) return;

        let strength = 0;
        if (password.length >= 8) strength++;
        if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
        if (password.match(/\d/)) strength++;
        if (password.match(/[^a-zA-Z\d]/)) strength++;

        strengthBar.classList.remove('weak', 'medium', 'strong');
        
        if (password.length === 0) {
            strengthText.textContent = 'Password strength';
            strengthBar.style.removeProperty('--strength-width');
            return;
        }

        if (strength <= 1) {
            strengthBar.classList.add('weak');
            strengthText.textContent = 'Weak password';
        } else if (strength === 2 || strength === 3) {
            strengthBar.classList.add('medium');
            strengthText.textContent = 'Medium password';
        } else {
            strengthBar.classList.add('strong');
            strengthText.textContent = 'Strong password';
        }
    }

    // Attach login handlers to social sign-in buttons in both login and signup flows.
    static initSocialButtons() {
        const buttons = [
            { selector: '#googleAuth', provider: 'google' },
            { selector: '#appleAuth', provider: 'apple' },
            { selector: '#googleSignup', provider: 'google' },
            { selector: '#appleSignup', provider: 'apple' }
        ];

        buttons.forEach(({ selector, provider }) => {
            const button = document.querySelector(selector);
            if (!button) return;

            button.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleSocialAuth(provider);
            });
        });
    }

    // Trigger a social login flow and persist auth state after a successful response.
    static async handleSocialAuth(provider) {
        try {
            // For real OAuth, redirect to the backend OAuth endpoint
            this.initiateOAuth(provider);
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                this.showToast('Cannot reach the backend. Start the backend server and open the page from a local web server.', 'error');
            } else if (error.message.includes('OAuth is not configured')) {
                // Show the detailed configuration message from backend
                this.showToast(error.message, 'error');
            } else {
                this.showToast(error.message || `Failed to sign in with ${provider}`, 'error');
            }
        }
    }

    static validateEmail(email) {
        const re = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
        return re.test(email);
    }

    static validatePassword(password) {
        return password.length >= 6;
    }

    static showError(inputId, message) {
        const errorDiv = document.getElementById(inputId);
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.add('show');
            const inputContainer = errorDiv.previousElementSibling?.querySelector?.('input, select')
                ? errorDiv.previousElementSibling
                : errorDiv.parentElement;
            const input = inputContainer?.querySelector('input, select');
            if (input) input.classList.add('error');
        }
    }

    static clearError(inputId) {
        const errorDiv = document.getElementById(inputId);
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.classList.remove('show');
            const inputContainer = errorDiv.previousElementSibling?.querySelector?.('input, select')
                ? errorDiv.previousElementSibling
                : errorDiv.parentElement;
            const input = inputContainer?.querySelector('input, select');
            if (input) input.classList.remove('error');
        }
    }

    static showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
        
        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <div class="toast-content">${message}</div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;
        
        container.appendChild(toast);
        
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => toast.remove());
        
        setTimeout(() => toast.remove(), 5000);
    }

    static async handleLogin(e, emailInput, passwordInput, submitBtn) {
        e.preventDefault();
        
        // Clear previous errors
        this.clearError('emailError');
        this.clearError('passwordError');
        
        let isValid = true;
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email) {
            this.showError('emailError', 'Email is required');
            isValid = false;
        } else if (!this.validateEmail(email)) {
            this.showError('emailError', 'Please enter a valid email address');
            isValid = false;
        }
        
        if (!password) {
            this.showError('passwordError', 'Password is required');
            isValid = false;
        }
        
        if (!isValid) return;
        
        // Show loading state
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        submitBtn.disabled = true;
        
        try {
            const loginData = await this.loginRequest(email, password);
            const token = loginData?.access_token;
            if (!token) throw new Error('No access token returned');

            const dashboardData = await this.fetchDashboardProfile(token);
            this.saveAuthState({
                token,
                user: dashboardData?.user,
                farmInfo: dashboardData?.farm_info
            });

            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;

            this.showToast('Welcome back! Redirecting to dashboard...', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } catch (error) {
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
            this.showToast(error.message || 'Login failed', 'error');
        }
    }

    static async handleSignup(e, submitBtn) {
        e.preventDefault();
        
        const fields = {
            fullname: document.getElementById('fullname'),
            email: document.getElementById('signup-email'),
            password: document.getElementById('signup-password'),
            confirmPassword: document.getElementById('confirm-password'),
            location: document.getElementById('location'),
            farmType: document.getElementById('farmType'),
            farmSize: document.getElementById('farmSize'),
            soilType: document.getElementById('soilType'),
            waterSource: document.getElementById('waterSource'),
            terms: document.getElementById('termsCheckbox')
        };
        
        // Clear all errors
        ['fullnameError', 'signupEmailError', 'signupPasswordError', 'confirmPasswordError', 
         'locationError', 'farmTypeError', 'farmSizeError', 'soilTypeError', 'waterSourceError', 'termsError'].forEach(id => {
            this.clearError(id);
        });
        
        let isValid = true;

        this.setSignupStep(2);
        
        // Validate fullname
        if (!fields.fullname.value.trim()) {
            this.showError('fullnameError', 'Full name is required');
            isValid = false;
        }
        
        // Validate email
        const email = fields.email.value.trim();
        if (!email) {
            this.showError('signupEmailError', 'Email is required');
            isValid = false;
        } else if (!this.validateEmail(email)) {
            this.showError('signupEmailError', 'Please enter a valid email address');
            isValid = false;
        }
        
        // Validate password
        const password = fields.password.value;
        if (!password) {
            this.showError('signupPasswordError', 'Password is required');
            isValid = false;
        } else if (!this.validatePassword(password)) {
            this.showError('signupPasswordError', 'Password must be at least 6 characters');
            isValid = false;
        }
        
        // Validate confirm password
        if (fields.confirmPassword.value !== password) {
            this.showError('confirmPasswordError', 'Passwords do not match');
            isValid = false;
        }
        
        // Validate location
        if (!fields.location.value.trim()) {
            this.showError('locationError', 'Location is required');
            isValid = false;
        }
        
        // Validate farm type
        if (!fields.farmType.value) {
            this.showError('farmTypeError', 'Please select farm type');
            isValid = false;
        }
        
        // Validate farm size
        if (!fields.farmSize.value) {
            this.showError('farmSizeError', 'Farm size is required');
            isValid = false;
        } else if (parseFloat(fields.farmSize.value) <= 0) {
            this.showError('farmSizeError', 'Farm size must be greater than 0');
            isValid = false;
        }
        
        // Validate soil type
        if (!fields.soilType.value) {
            this.showError('soilTypeError', 'Please select soil type');
            isValid = false;
        }

        // Validate water source
        if (!fields.waterSource.value) {
            this.showError('waterSourceError', 'Please select water source');
            isValid = false;
        }

        // Validate terms
        if (!fields.terms.checked) {
            this.showError('termsError', 'You must agree to the Terms of Service');
            isValid = false;
        }
        
        if (!isValid) return;
        
        // Show loading state
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        submitBtn.disabled = true;
        
        try {
            await this.signupRequest({
                name: fields.fullname.value.trim(),
                email: fields.email.value.trim(),
                password: fields.password.value,
                location: fields.location.value.trim(),
                farm_type: fields.farmType.value,
                farm_size: fields.farmSize.value,
                soil_type: fields.soilType.value,
                water_source: fields.waterSource.value
            });

            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
            
            this.showToast('Account created successfully! Redirecting to login...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html?auth=login';
            }, 1500);
        } catch (error) {
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
            this.showToast(error.message || 'Signup failed', 'error');
        }
    }
}

// Initialize based on current page
document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = document.getElementById('loginForm') !== null;
    const isSignupPage = document.getElementById('signupForm') !== null;
    
    if (isLoginPage) AuthManager.initLogin();
    if (isSignupPage) AuthManager.initSignup();
});

window.AuthManager = AuthManager;
