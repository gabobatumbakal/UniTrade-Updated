// =====================================
// UNITRADE STUDENT MARKETPLACE
// CORRECTED COMPLETE SCRIPT.JS
// =====================================


// =====================================
// 1. SUPABASE CONNECTION
// =====================================

const SUPABASE_URL = "https://ajbhkkpbysojewemxrvs.supabase.co";
const SUPABASE_KEY = "sb_publishable_8u7SqeT6XW2ofmr1nQC7rg_mOgNKIsg";

let db = null;

let currentUser = null;
let currentProfile = null;
let authMode = "login";
let authInitialized = false;
let isManualLogout = false;
let isHandlingAuthSubmit = false;
let isRecoveryMode = false;

let products = [];
let adminUsers = [];
let cartItems = [];

let pendingDeleteId = null;
let pendingStatusProductId = null;
let pendingProductStatus = null;

let editingProductId = null;
let editingImageFile = null;

let selectedProduct = null;
let checkoutMode = false;
let checkoutItems = [];
let isSubmittingOrder = false;

if (window.supabase && SUPABASE_URL.startsWith("https://")) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}


// =====================================
// 2. HELPER FUNCTIONS
// =====================================

const get = id => document.getElementById(id);

function on(id, event, callback) {
    const element = get(id);
    if (element) element.addEventListener(event, callback);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showMessage(id, message, type = "") {
    const element = get(id);
    if (!element) return;

    element.textContent = message;
    element.className = "message " + type;
}

function formatPrice(price) {
    return "₱" + Number(price || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function validQuantity(quantity) {
    const number = Number(quantity);
    return Number.isInteger(number) && number >= 1 ? number : null;
}


// =====================================
// 3. PAGE NAVIGATION
// =====================================

const PAGE_TITLES = {
    home: "SLSU Student Marketplace",
    explore: "Explore Products",
    sell: "Sell an Item",
    myListings: "My Listings",
    cart: "Shopping Cart",
    myPurchases: "My Purchases",
    incomingOrders: "Incoming Orders",
    myProfile: "My Profile",
    sellerProfile: "Seller Profile",
    productDetails: "Product Details",
    about: "About UniTrade",
    userGuide: "User Guide",
    settings: "Settings",
    auth: "Student Account",
    authLoading: "Checking Session",
    admin: "Admin Dashboard"
};

const PROTECTED_PAGES = new Set([
    "home",
    "explore",
    "sell",
    "myListings",
    "cart",
    "myPurchases",
    "incomingOrders",
    "myProfile",
    "sellerProfile",
    "productDetails",
    "about",
    "userGuide",
    "settings",
    "admin"
]);

function setAuthGateState(locked) {
    document.body.classList.toggle("auth-gate-active", Boolean(locked));
}

function clearProtectedStateAndDOM() {
    products = [];
    adminUsers = [];
    cartItems = [];
    selectedProduct = null;
    checkoutMode = false;
    checkoutItems = [];
    pendingDeleteId = null;
    pendingStatusProductId = null;
    pendingProductStatus = null;
    editingProductId = null;
    editingImageFile = null;

    [
        "featuredProductsGrid",
        "recentProductsGrid",
        "popularProductsGrid",
        "exploreProductGrid",
        "productGrid",
        "myProductGrid",
        "myListingsTableBody",
        "myPurchasesGrid",
        "incomingOrdersGrid",
        "cartGrid",
        "adminProductGrid",
        "userTable"
    ].forEach(id => {
        const el = get(id);
        if (el) el.innerHTML = "";
    });

    if (get("popularHomeSection")) get("popularHomeSection").classList.add("hidden");
    if (get("cartTotal")) get("cartTotal").textContent = formatPrice(0);
    if (get("navCartBadge")) {
        get("navCartBadge").textContent = "0";
        get("navCartBadge").classList.add("hidden");
    }

    if (get("searchInput")) get("searchInput").value = "";
    if (get("exploreSearchInput")) get("exploreSearchInput").value = "";

    [
        "profileFullName",
        "profileRole",
        "profileStudentId",
        "profileCourse",
        "profileYearLevel",
        "profileDropdownEmail",
        "profileDropdownStudentId",
        "profileDropdownCourse"
    ].forEach(id => {
        const el = get(id);
        if (el) el.textContent = "—";
    });

    [
        "editProductModal",
        "deleteConfirmModal",
        "logoutModal",
        "buyNowModal",
        "cartAddedModal",
        "adminStatusModal",
        "adminDeleteModal",
        "chatModal",
        "editProfileModal"
    ].forEach(id => {
        const modal = get(id);
        if (modal) modal.classList.add("hidden");
    });

    closeProfileDropdown();
    toggleMobileSidebar(false);
}

function getRequestedPageFromURL() {
    const params = new URLSearchParams(window.location.search);
    const queryPage = params.get("page");
    const hashPage = window.location.hash.replace(/^#\/?/, "").trim();
    const pathSegment = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    const candidate = hashPage || queryPage || pathSegment;

    if (candidate && PROTECTED_PAGES.has(candidate)) {
        if (candidate === "admin" && currentProfile?.role !== "admin") {
            return "home";
        }
        return candidate;
    }

    return "home";
}

function syncURLForPage(page, options = {}) {
    if (options.skipHistory) return;

    if (!currentUser || page === "auth") {
        if (window.location.hash !== "#login") {
            history.replaceState({ page: "auth", locked: true }, "", "#login");
        }
        return;
    }

    if (page === "authLoading") return;

    const targetHash = "#" + page;
    if (options.replaceHistory) {
        history.replaceState({ page }, "", targetHash);
    } else if (window.location.hash !== targetHash) {
        history.pushState({ page }, "", targetHash);
    }
}

function showPage(page, options = {}) {
    if (!authInitialized && page !== "authLoading") {
        page = "authLoading";
    }

    if (authInitialized && !currentUser && page !== "auth") {
        setAuthGateState(true);
        const targetAuth = get("auth");
        if (targetAuth) {
            document.querySelectorAll(".page").forEach(section => {
                section.classList.add("hidden");
            });
            targetAuth.classList.remove("hidden");
        }
        if (get("topbarPageHeading")) {
            get("topbarPageHeading").textContent = "SLSU Student Marketplace";
        }
        if (!isRecoveryMode && get("forgotPasswordForm")?.classList.contains("hidden")) {
            setAuthMode("login");
        }
        syncURLForPage("auth", { skipHistory: options.skipHistory });
        if (page !== "authLoading" && page !== "home") {
            showMessage("authMessage", "Please sign in to access the SLSU Student Marketplace.", "error");
        }
        window.scrollTo(0, 0);
        return;
    }

    if (currentUser && page === "auth" && !isRecoveryMode) {
        page = "home";
    }

    if (page === "admin" && currentProfile?.role !== "admin") {
        alert("Access denied. Admin only.");
        return;
    }

    const targetPage = get(page);

    if (!targetPage) {
        console.error("Page not found:", page);
        return;
    }

    document.querySelectorAll(".page").forEach(section => {
        section.classList.add("hidden");
    });

    targetPage.classList.remove("hidden");

    document.querySelectorAll(".nav-links button, .sidebar-nav button").forEach(button => {
        button.classList.remove("active");
    });

    document.querySelectorAll(
        `.nav-links button[onclick="showPage('${page}')"], .sidebar-nav button[onclick="showPage('${page}')"]`
    ).forEach(button => {
        button.classList.add("active");
    });

    if (get("topbarPageHeading")) {
        get("topbarPageHeading").textContent = PAGE_TITLES[page] || "SLSU Student Marketplace";
    }

    toggleMobileSidebar(false);
    syncURLForPage(page, options);

    if (page === "explore") displayExploreProducts();
    if (page === "myListings") loadMyListings();
    if (page === "myProfile") loadMyProfile();
    if (page === "admin") loadAdminDashboard();
    if (page === "sell") updateSellPage();

    if (page === "cart") {
        loadCart();
        renderCart();
    }

    if (page === "myPurchases") loadMyPurchases();
    if (page === "incomingOrders") loadIncomingOrders();

    window.scrollTo(0, 0);
}


// =====================================
// 4. MY PROFILE
// =====================================

function loadMyProfile() {
    if (!currentUser || !currentProfile) {
        const modal = get("logoutModal");

        if (!modal) {
            alert("Please login first.");
            return;
        }

        modal.querySelector("h2").textContent = "Login Required";
        modal.querySelector("p").textContent =
            "Please log in first to view your profile.";

        get("cancelLogout").textContent = "OK";
        get("confirmLogout").classList.add("hidden");
        modal.classList.remove("hidden");
        return;
    }

    if (get("profileFullName")) {
        get("profileFullName").textContent =
            currentProfile.full_name || "No name";
    }

    if (get("profileRole")) {
        get("profileRole").textContent =
            currentProfile.role === "admin" ? "Administrator" : "Student";
    }

    if (get("profileStudentId")) {
        get("profileStudentId").textContent =
            currentProfile.student_id || "Not provided";
    }

    if (get("profileCourse")) {
        get("profileCourse").textContent =
            currentProfile.course || "Not provided";
    }

    if (get("profileYearLevel")) {
        get("profileYearLevel").textContent =
            currentProfile.year_level || "Not provided";
    }
}


// =====================================
// 5. ACCOUNT DISPLAY AND LOGOUT
// =====================================

function updateAccount() {
    if (get("accountBtn")) {
        get("accountBtn").textContent = currentUser ? "Logout" : "Login";
    }

    if (get("adminNav")) {
        get("adminNav").classList.toggle(
            "hidden",
            currentProfile?.role !== "admin"
        );
    }

    const fullName = currentProfile?.full_name || currentUser?.email?.split("@")[0] || "Account";
    const initial = (fullName.trim().charAt(0) || "U").toUpperCase();
    const roleLabel = currentProfile?.role === "admin" ? "Administrator" : (currentUser ? "SLSU Student" : "SLSU Community");
    const chipRoleLabel = currentProfile?.role === "admin" ? "Admin" : (currentUser ? "Student" : "Visitor");

    if (get("profileMenuAvatar")) get("profileMenuAvatar").textContent = currentUser ? initial : "U";
    if (get("profileMenuName")) get("profileMenuName").textContent = currentUser ? fullName : "Account";
    if (get("profileMenuRole")) get("profileMenuRole").textContent = chipRoleLabel;
    if (get("profileDropdownName")) get("profileDropdownName").textContent = currentUser ? fullName : "Guest Visitor";
    if (get("profileDropdownRole")) get("profileDropdownRole").textContent = roleLabel;
    if (get("profileDropdownEmail")) get("profileDropdownEmail").textContent = currentProfile?.email || currentUser?.email || "—";
    if (get("profileDropdownStudentId")) get("profileDropdownStudentId").textContent = currentProfile?.student_id || "Not provided";
    if (get("profileDropdownCourse")) get("profileDropdownCourse").textContent = currentProfile?.course || "Not provided";
    if (get("profileMenuAuthItems")) get("profileMenuAuthItems").classList.toggle("hidden", !currentUser);
    if (get("profileMenuGuestItems")) get("profileMenuGuestItems").classList.toggle("hidden", Boolean(currentUser));
}

async function handleAccount() {
    if (currentUser) {
        const modal = get("logoutModal");

        if (!modal) {
            const confirmed = confirm("Are you sure you want to logout?");
            if (confirmed) await performLogout();
            return;
        }

        modal.querySelector("h2").textContent = "Confirm Logout";
        modal.querySelector("p").textContent =
            "Are you sure you want to logout?";

        get("cancelLogout").textContent = "Cancel";
        get("confirmLogout").classList.remove("hidden");
        modal.classList.remove("hidden");
    } else {
        showPage("auth");
        setAuthMode("login");
    }
}

async function performLogout() {
    if (!db) return;

    isManualLogout = true;

    try {
        const { error } = await db.auth.signOut();
        if (error) throw error;

        currentUser = null;
        currentProfile = null;
        isRecoveryMode = false;

        clearProtectedStateAndDOM();
        setAuthGateState(true);
        updateAccount();
        updateSellPage();
        setAuthMode("login");

        history.replaceState({ page: "auth", locked: true }, "", "#login");
        history.pushState({ page: "auth", locked: true }, "", "#login");

        showPage("auth", { skipHistory: true });
        showMessage(
            "authMessage",
            "You have been logged out. Please sign in to access UniTrade.",
            "success"
        );

    } catch (error) {
        isManualLogout = false;
        alert("Logout failed: " + error.message);
    }
}

on("cancelLogout", "click", function() {
    const modal = get("logoutModal");
    if (modal) modal.classList.add("hidden");

    if (modal) {
        modal.querySelector("h2").textContent = "Confirm Logout";
        modal.querySelector("p").textContent =
            "Are you sure you want to logout?";
    }

    if (get("cancelLogout")) {
        get("cancelLogout").textContent = "Cancel";
    }

    if (get("confirmLogout")) {
        get("confirmLogout").classList.remove("hidden");
    }
});

on("confirmLogout", "click", async function() {
    const button = get("confirmLogout");
    if (button) button.disabled = true;

    await performLogout();

    if (button) button.disabled = false;
});


// =====================================
// 6. LOAD USER SESSION
// =====================================

async function handleSessionInvalidated(notice = "Your session has expired. Please log in again.") {
    currentUser = null;
    currentProfile = null;
    isRecoveryMode = false;

    clearProtectedStateAndDOM();
    authInitialized = true;
    setAuthGateState(true);
    updateAccount();
    updateSellPage();
    setAuthMode("login");

    history.replaceState({ page: "auth", locked: true }, "", "#login");
    history.pushState({ page: "auth", locked: true }, "", "#login");

    showPage("auth", { skipHistory: true });
    if (notice) {
        showMessage("authMessage", notice, "error");
    }
}

async function verifyAuthenticatedUser() {
    if (!db || !currentUser) return false;

    try {
        const { data, error } = await db.auth.getUser();
        if (error || !data?.user || data.user.id !== currentUser.id) {
            await handleSessionInvalidated("Your session has expired. Please log in again.");
            return false;
        }
        return true;
    } catch {
        await handleSessionInvalidated("Your session has expired. Please log in again.");
        return false;
    }
}

async function loadSession(options = {}) {
    const shouldNavigate = options.navigate !== false;

    if (!db) {
        currentUser = null;
        currentProfile = null;
        clearProtectedStateAndDOM();
        authInitialized = true;
        setAuthGateState(true);
        updateAccount();
        setAuthMode("login");
        showPage("auth", { replaceHistory: true });
        showMessage(
            "authMessage",
            "Database not connected. Please check Supabase settings.",
            "error"
        );
        return;
    }

    try {
        const { data, error } = await db.auth.getSession();

        if (error) throw error;

        const sessionUser = data?.session?.user || null;

        if (!sessionUser) {
            currentUser = null;
            currentProfile = null;
            clearProtectedStateAndDOM();
            authInitialized = true;
            setAuthGateState(true);
            updateAccount();
            updateSellPage();
            if (shouldNavigate) {
                setAuthMode("login");
                showPage("auth", { replaceHistory: true });
            }
            return;
        }

        // Verify session against Supabase Auth server to catch expired/revoked tokens.
        const { data: userData, error: userError } = await db.auth.getUser();

        if (userError || !userData?.user) {
            await db.auth.signOut({ scope: "local" }).catch(() => {});
            await handleSessionInvalidated("Your session has expired. Please log in again.");
            return;
        }

        currentUser = userData.user;
        currentProfile = null;

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("id, full_name, role, student_id, course, year_level")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (profileError) throw profileError;

        currentProfile = profile || null;
        authInitialized = true;

        updateAccount();
        updateSellPage();

        if (shouldNavigate) {
            if (isRecoveryMode) {
                setAuthGateState(true);
                openResetPasswordForm();
                return;
            }

            // Load cart only after identifying the current account.
            loadCart();
            await loadProducts();
            renderCart();

            setAuthGateState(false);
            const targetPage = getRequestedPageFromURL();
            showPage(targetPage, { replaceHistory: true });
        }

    } catch (error) {
        console.error("Session Error:", error);
        currentUser = null;
        currentProfile = null;
        clearProtectedStateAndDOM();
        authInitialized = true;
        setAuthGateState(true);
        updateAccount();
        setAuthMode("login");
        showPage("auth", { replaceHistory: true });
        showMessage("authMessage", error.message, "error");
    }
}


// =====================================
// 7. SIGN UP AND LOGIN
// =====================================

const REMEMBERED_EMAIL_KEY = "unitrade_remembered_email";

function setAuthButtonLoading(buttonId, textId, isLoading, loadingText, defaultText) {
    const button = get(buttonId);
    const textEl = get(textId);
    if (button) {
        button.disabled = Boolean(isLoading);
        button.classList.toggle("is-loading", Boolean(isLoading));
    }
    if (textEl) {
        textEl.textContent = isLoading ? loadingText : defaultText;
    }
}

function resetPasswordVisibility(buttonId, inputId) {
    const button = get(buttonId);
    const input = get(inputId);
    if (input) input.type = "password";
    if (button) {
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", "Show password");
        button.querySelector(".icon-eye-open")?.classList.remove("hidden");
        button.querySelector(".icon-eye-closed")?.classList.add("hidden");
    }
}

function bindPasswordToggle(buttonId, inputId) {
    on(buttonId, "click", function() {
        const input = get(inputId);
        const button = get(buttonId);
        if (!input || !button) return;

        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        button.setAttribute("aria-pressed", reveal ? "true" : "false");
        button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        button.querySelector(".icon-eye-open")?.classList.toggle("hidden", reveal);
        button.querySelector(".icon-eye-closed")?.classList.toggle("hidden", !reveal);
    });
}

bindPasswordToggle("togglePasswordBtn", "password");
bindPasswordToggle("toggleConfirmPasswordBtn", "confirmPassword");
bindPasswordToggle("toggleNewPasswordBtn", "newPassword");
bindPasswordToggle("toggleConfirmNewPasswordBtn", "confirmNewPassword");

on("toggleTermsPreview", "click", function() {
    const box = get("termsPreviewBox");
    if (!box) return;
    const isHidden = box.classList.toggle("hidden");
    this.setAttribute("aria-expanded", isHidden ? "false" : "true");
});

(function initAuthCarousel() {
    const frame = document.querySelector("#auth .auth-visual-frame");
    const slides = Array.from(document.querySelectorAll("#auth .auth-slide-item"));
    const dots = Array.from(document.querySelectorAll("#auth .auth-carousel-dot"));
    if (!slides.length || !dots.length) return;

    const preloadedUrls = new Set();
    let currentSlide = 0;
    let timerId = null;

    function preloadSlide(index) {
        const target = slides[((index % slides.length) + slides.length) % slides.length];
        const img = target?.querySelector("img");
        const src = img?.getAttribute("src");
        if (!src || preloadedUrls.has(src)) return;

        preloadedUrls.add(src);
        const preloader = new Image();
        preloader.src = src;
    }

    function showSlide(index) {
        currentSlide = ((index % slides.length) + slides.length) % slides.length;
        if (frame) {
            frame.setAttribute("data-active-slide", String(currentSlide));
        }

        slides.forEach((slide, idx) => {
            slide.classList.toggle("active", idx === currentSlide);
        });
        dots.forEach((dot, idx) => {
            const active = idx === currentSlide;
            dot.classList.toggle("active", active);
            dot.setAttribute("aria-selected", active ? "true" : "false");
        });

        preloadSlide(currentSlide + 1);
    }

    function startAutoRotate() {
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
            const authSection = get("auth");
            const authVisible = authSection && !authSection.classList.contains("hidden");
            if (authVisible || document.body.classList.contains("auth-gate-active")) {
                showSlide(currentSlide + 1);
            }
        }, 5000);
    }

    dots.forEach(dot => {
        dot.addEventListener("click", () => {
            const idx = Number(dot.getAttribute("data-slide") || 0);
            showSlide(idx);
            startAutoRotate();
        });
    });

    slides.forEach((_, idx) => preloadSlide(idx));
    showSlide(0);
    startAutoRotate();
})();

function restoreRememberedEmail() {
    const emailInput = get("email");
    const rememberCheckbox = get("rememberMe");
    if (!emailInput || !rememberCheckbox) return;

    try {
        const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
        if (savedEmail) {
            if (!emailInput.value) emailInput.value = savedEmail;
            rememberCheckbox.checked = true;
        }
    } catch {
        // Ignore storage restrictions
    }
}

function setAuthMode(mode) {
    authMode = mode;

    if (get("authForm")) get("authForm").classList.remove("hidden");
    if (get("authFooterLinks")) get("authFooterLinks").classList.remove("hidden");
    if (get("forgotPasswordForm")) get("forgotPasswordForm").classList.add("hidden");
    if (get("resetPasswordForm")) get("resetPasswordForm").classList.add("hidden");

    if (get("authTitle")) {
        get("authTitle").textContent =
            mode === "signup"
                ? "Create an Account"
                : mode === "admin"
                    ? "Admin Login"
                    : "Welcome Back";
    }

    if (get("authDescription")) {
        get("authDescription").textContent =
            mode === "signup"
                ? "Join the UniTrade student community."
                : mode === "admin"
                    ? "Sign in with your administrator account to access UniTrade."
                    : "Log in to continue to your UniTrade marketplace.";
    }

    const defaultBtnLabel = mode === "signup" ? "Create Account" : "Login";
    setAuthButtonLoading("authSubmit", "authSubmitText", false, defaultBtnLabel, defaultBtnLabel);

    const isSignup = mode === "signup";

    if (get("loginOptionsRow")) {
        get("loginOptionsRow").classList.toggle("hidden", mode !== "login");
    }

    ["nameGroup", "studentMetaRow", "courseGroup", "confirmPasswordGroup", "termsGroup"]
        .forEach(id => {
            if (get(id)) {
                get(id).classList.toggle("hidden", !isSignup);
            }
        });

    ["firstName", "lastName", "studentId", "course", "yearLevel", "confirmPassword", "acceptTerms"]
        .forEach(id => {
            if (get(id)) get(id).required = isSignup;
        });

    if (get("password")) {
        get("password").autocomplete = isSignup ? "new-password" : "current-password";
    }

    if (get("termsPreviewBox")) {
        get("termsPreviewBox").classList.add("hidden");
    }

    resetPasswordVisibility("togglePasswordBtn", "password");
    resetPasswordVisibility("toggleConfirmPasswordBtn", "confirmPassword");

    if (get("switchText")) {
        get("switchText").textContent =
            mode === "signup"
                ? "Already have an account?"
                : mode === "admin"
                    ? "Not an admin?"
                    : "Don't have an account?";
    }

    if (get("switchAuth")) {
        get("switchAuth").textContent =
            mode === "signup"
                ? "Log in"
                : mode === "admin"
                    ? "Student Login"
                    : "Create an account";
    }

    showMessage("authMessage", "");
    showMessage("forgotPasswordMessage", "");
    showMessage("resetPasswordMessage", "");
}

function openForgotPasswordForm() {
    if (get("authForm")) get("authForm").classList.add("hidden");
    if (get("authFooterLinks")) get("authFooterLinks").classList.add("hidden");
    if (get("resetPasswordForm")) get("resetPasswordForm").classList.add("hidden");
    if (get("forgotPasswordForm")) get("forgotPasswordForm").classList.remove("hidden");

    if (get("authTitle")) get("authTitle").textContent = "Forgot Password";
    if (get("authDescription")) {
        get("authDescription").textContent =
            "Enter your registered email address and we will send you a password reset link.";
    }

    setAuthButtonLoading("forgotSubmit", "forgotSubmitText", false, "Sending Link...", "Send Reset Link");
    showMessage("authMessage", "");
    showMessage("forgotPasswordMessage", "");
}

function openResetPasswordForm() {
    if (get("authForm")) get("authForm").classList.add("hidden");
    if (get("authFooterLinks")) get("authFooterLinks").classList.add("hidden");
    if (get("forgotPasswordForm")) get("forgotPasswordForm").classList.add("hidden");
    if (get("resetPasswordForm")) get("resetPasswordForm").classList.remove("hidden");

    if (get("authTitle")) get("authTitle").textContent = "Set New Password";
    if (get("authDescription")) {
        get("authDescription").textContent =
            "Enter a strong new password for your UniTrade account.";
    }

    resetPasswordVisibility("toggleNewPasswordBtn", "newPassword");
    resetPasswordVisibility("toggleConfirmNewPasswordBtn", "confirmNewPassword");
    setAuthButtonLoading("resetSubmit", "resetSubmitText", false, "Updating...", "Update Password");

    showPage("auth", { skipHistory: true });
    showMessage("resetPasswordMessage", "");
}

on("switchAuth", "click", function(event) {
    event.preventDefault();

    if (authMode === "signup") {
        setAuthMode("login");
    } else if (authMode === "admin") {
        setAuthMode("login");
    } else {
        setAuthMode("signup");
    }
});

on("adminLoginLink", "click", function(event) {
    event.preventDefault();
    setAuthMode("admin");
});

on("forgotPasswordLink", "click", function(event) {
    event.preventDefault();
    openForgotPasswordForm();
});

on("backToLoginFromForgot", "click", function(event) {
    event.preventDefault();
    setAuthMode("login");
});

on("backToLoginFromReset", "click", function(event) {
    event.preventDefault();
    isRecoveryMode = false;
    setAuthMode("login");
});

on("forgotPasswordForm", "submit", async function(event) {
    event.preventDefault();

    if (!db) {
        showMessage("forgotPasswordMessage", "Database not connected.", "error");
        return;
    }

    const forgotEmail = get("forgotEmail")?.value.trim() || "";

    if (!forgotEmail) {
        showMessage("forgotPasswordMessage", "Please enter your registered email address.", "error");
        return;
    }

    setAuthButtonLoading("forgotSubmit", "forgotSubmitText", true, "Sending Link...", "Send Reset Link");

    try {
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await db.auth.resetPasswordForEmail(forgotEmail, {
            redirectTo
        });

        if (error) throw error;

        showMessage(
            "forgotPasswordMessage",
            "Password reset instructions have been sent to your email.",
            "success"
        );
    } catch (error) {
        showMessage("forgotPasswordMessage", error.message, "error");
    } finally {
        setAuthButtonLoading("forgotSubmit", "forgotSubmitText", false, "Sending Link...", "Send Reset Link");
    }
});

on("resetPasswordForm", "submit", async function(event) {
    event.preventDefault();

    if (!db) {
        showMessage("resetPasswordMessage", "Database not connected.", "error");
        return;
    }

    const newPassword = get("newPassword")?.value || "";
    const confirmNewPassword = get("confirmNewPassword")?.value || "";

    if (newPassword.length < 8) {
        showMessage("resetPasswordMessage", "Password must be at least 8 characters.", "error");
        return;
    }

    if (newPassword !== confirmNewPassword) {
        showMessage("resetPasswordMessage", "Passwords do not match.", "error");
        return;
    }

    setAuthButtonLoading("resetSubmit", "resetSubmitText", true, "Updating...", "Update Password");

    try {
        const { error } = await db.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        isRecoveryMode = false;
        if (get("newPassword")) get("newPassword").value = "";
        if (get("confirmNewPassword")) get("confirmNewPassword").value = "";
        resetPasswordVisibility("toggleNewPasswordBtn", "newPassword");
        resetPasswordVisibility("toggleConfirmNewPasswordBtn", "confirmNewPassword");

        showMessage(
            "resetPasswordMessage",
            "Password updated successfully! Redirecting to marketplace...",
            "success"
        );

        await loadSession({ navigate: false });
        if (currentUser) {
            loadCart();
            await loadProducts();
            renderCart();
            setTimeout(() => {
                if (currentUser) {
                    setAuthGateState(false);
                    showPage("home", { replaceHistory: true });
                }
            }, 800);
        } else {
            setTimeout(() => setAuthMode("login"), 800);
        }
    } catch (error) {
        showMessage("resetPasswordMessage", error.message, "error");
    } finally {
        setAuthButtonLoading("resetSubmit", "resetSubmitText", false, "Updating...", "Update Password");
    }
});

on("authForm", "submit", async function(event) {
    event.preventDefault();

    if (!db) {
        showMessage(
            "authMessage",
            "Please connect your Supabase project first.",
            "error"
        );
        return;
    }

    const mode = authMode;
    const email = get("email").value.trim();
    const password = get("password").value;
    const firstName = get("firstName")?.value.trim() || "";
    const lastName = get("lastName")?.value.trim() || "";
    const fullName = `${firstName} ${lastName}`.trim();

    const loadingLabel = mode === "signup" ? "Creating Account..." : "Logging in...";
    const defaultLabel = mode === "signup" ? "Create Account" : "Login";

    setAuthButtonLoading("authSubmit", "authSubmitText", true, loadingLabel, defaultLabel);
    isHandlingAuthSubmit = true;

    try {
        if (mode === "signup") {
            const studentId = get("studentId")?.value.trim() || "";
            const course = get("course")?.value.trim() || "";
            const yearLevel = get("yearLevel")?.value || "";
            const confirmPassword = get("confirmPassword")?.value || "";
            const acceptedTerms = Boolean(get("acceptTerms")?.checked);

            if (!firstName || !lastName || !studentId || !course || !yearLevel) {
                throw new Error("Please complete all student information.");
            }

            if (password.length < 8) {
                throw new Error("Password must be at least 8 characters.");
            }

            if (password !== confirmPassword) {
                throw new Error("Passwords do not match.");
            }

            if (!acceptedTerms) {
                throw new Error("Please agree to the Terms & Conditions for SLSU students.");
            }

            const { data, error } = await db.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        student_id: studentId,
                        course: course,
                        year_level: yearLevel
                    }
                }
            });

            if (error) throw error;

            if (data.session) {
                await loadSession({ navigate: false });
                if (get("password")) get("password").value = "";
                if (get("confirmPassword")) get("confirmPassword").value = "";

                loadCart();
                await loadProducts();
                renderCart();

                showMessage(
                    "authMessage",
                    "Student account created successfully!",
                    "success"
                );

                setTimeout(() => {
                    if (currentUser) {
                        setAuthGateState(false);
                        showPage("home", { replaceHistory: true });
                    }
                }, 600);
            } else {
                if (get("password")) get("password").value = "";
                if (get("confirmPassword")) get("confirmPassword").value = "";
                showMessage(
                    "authMessage",
                    "Registration successful! Please verify your email before logging in.",
                    "success"
                );
            }

        } else {
            try {
                if (get("rememberMe")?.checked) {
                    localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
                } else {
                    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
                }
            } catch {
                // Ignore storage restrictions
            }

            const { error } = await db.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            await loadSession({ navigate: false });

            // Student Login must not allow an admin account.
            if (mode === "login" && currentProfile?.role === "admin") {
                await db.auth.signOut();

                currentUser = null;
                currentProfile = null;
                clearProtectedStateAndDOM();
                updateAccount();

                throw new Error(
                    "Please use Admin Login for this account."
                );
            }

            // Admin Login must only allow an admin account.
            if (mode === "admin" && currentProfile?.role !== "admin") {
                await db.auth.signOut();

                currentUser = null;
                currentProfile = null;
                clearProtectedStateAndDOM();
                updateAccount();

                throw new Error(
                    "Access denied. This account is not an administrator."
                );
            }

            if (get("password")) get("password").value = "";

            loadCart();
            await loadProducts();
            renderCart();

            showMessage(
                "authMessage",
                mode === "admin"
                    ? "Admin login successful!"
                    : "Student login successful!",
                "success"
            );

            setTimeout(() => {
                if (currentUser) {
                    setAuthGateState(false);
                    showPage("home", { replaceHistory: true });
                }
            }, 600);
        }

    } catch (error) {
        showMessage("authMessage", error.message, "error");

    } finally {
        isHandlingAuthSubmit = false;
        const resetLabel = authMode === "signup" ? "Create Account" : "Login";
        setAuthButtonLoading("authSubmit", "authSubmitText", false, resetLabel, resetLabel);
    }
});

setAuthMode("login");
restoreRememberedEmail();


// =====================================
// 8. LOAD PRODUCTS
// =====================================

async function loadProducts() {
    if (!db || !currentUser) {
        products = [];
        return;
    }

    try {
        const { data, error } = await db
            .from("products")
            .select(`
                id,
                title,
                description,
                price,
                category,
                image_url,
                seller_id,
                status,
                stock_quantity,
                condition,
                created_at,
                profiles(full_name, role)
            `)
            .eq("status", "active")
            .order("created_at", { ascending: false });

        if (error) throw error;

        products = data || [];
        displayProducts();

    } catch (error) {
        console.error("Load Products Error:", error);
        showMessage("homeMessage", error.message, "error");
    }
}


// =====================================
// 9. PRODUCT CARDS
// =====================================

function createProductCard(product, showDelete = false) {
    const image = product.image_url
        ? `<img src="${escapeHTML(product.image_url)}" alt="${escapeHTML(product.title)}" referrerpolicy="no-referrer">`
        : `<span class="product-image-placeholder" aria-hidden="true">📦</span>`;

    const sellerName = product.profiles?.full_name || "SLSU Student";
    const conditionLabel = product.condition || "Good Condition";

    const hasStockNum = typeof product.stock_quantity === "number" && Number.isFinite(product.stock_quantity);
    const stockQty = hasStockNum ? product.stock_quantity : 1;
    const isOutOfStock = hasStockNum && stockQty <= 0;
    const stockText = isOutOfStock
        ? "Out of stock"
        : hasStockNum
            ? `${stockQty} in stock`
            : "Available";
    const stockClass = isOutOfStock ? "out-of-stock" : stockQty <= 2 && hasStockNum ? "low-stock" : "in-stock";

    const isOwner =
        currentUser && product.seller_id === currentUser.id;

    let actionButtons = "";

    if (showDelete) {
        actionButtons = `<div class="product-card-actions">`;
        if (isOwner) {
            actionButtons += `
                <button type="button" class="btn-primary"
                    onclick="event.stopPropagation(); editProduct('${product.id}')">
                    Edit Listing
                </button>
            `;
        }

        actionButtons += `
            <button type="button" class="btn-danger"
                onclick="event.stopPropagation(); deleteProduct('${product.id}')">
                Delete Listing
            </button>
        </div>`;

    } else if (currentUser && !isOwner) {
        actionButtons = `
            <div class="product-card-actions">
                <button type="button" class="btn-outline"
                    onclick="event.stopPropagation(); openProductDetails('${product.id}')">
                    Add to Cart
                </button>

                <button type="button" class="btn-primary"
                    onclick="event.stopPropagation(); openBuyNow('${product.id}', 1)"
                    ${isOutOfStock ? "disabled" : ""}>
                    Buy Now
                </button>
            </div>
        `;
    } else if (!currentUser) {
        actionButtons = `
            <div class="product-card-actions">
                <button type="button" class="btn-outline"
                    onclick="event.stopPropagation(); openProductDetails('${product.id}')">
                    View Details
                </button>
            </div>
        `;
    }

    return `
        <article class="product-card" onclick="openProductDetails('${product.id}')">
            <div class="product-image">
                ${image}
            </div>

            <div class="product-info">
                <h3>${escapeHTML(product.title || "")}</h3>

                <div class="product-price tabular-nums">${formatPrice(product.price)}</div>

                <div class="product-badges-row">
                    <span class="condition-badge">${escapeHTML(conditionLabel)}</span>
                    <span class="stock-indicator ${stockClass}">${escapeHTML(stockText)}</span>
                </div>

                <div class="product-seller-row">
                    <span class="seller-avatar-mini" aria-hidden="true">${escapeHTML((sellerName.charAt(0) || "S").toUpperCase())}</span>
                    <span class="seller-name-text">by ${escapeHTML(sellerName)}</span>
                </div>

                ${actionButtons}
            </div>
        </article>
    `;
}


// =====================================
// 10. PRODUCT DETAILS
// =====================================

function openProductDetails(productId) {
    if (!currentUser) {
        showPage("auth");
        return;
    }

    const product = products.find(item => item.id === productId);

    if (!product) {
        alert("Product not found.");
        return;
    }

    if (product.seller_id === currentUser.id) {
        alert("You cannot buy your own product.");
        return;
    }

    selectedProduct = product;

    get("detailsImage").innerHTML = product.image_url
        ? `<img src="${escapeHTML(product.image_url)}" alt="${escapeHTML(product.title)}">`
        : "📦";

    if (get("detailsCategoryMeta")) {
        get("detailsCategoryMeta").textContent = product.category || "Marketplace Item";
    }
    if (get("detailsConditionMeta")) {
        get("detailsConditionMeta").textContent = product.condition || "Good Condition";
    }
    if (get("detailsStockMeta")) {
        const qty = product.stock_quantity;
        get("detailsStockMeta").textContent = typeof qty === "number" ? `${qty} in stock` : "In Stock";
    }

    get("detailsTitle").textContent = product.title;
    get("detailsPrice").textContent = formatPrice(product.price);

    get("detailsDescription").textContent =
        product.description || "No description available.";

    get("detailsSeller").textContent =
        "Seller: " + (product.profiles?.full_name || "Unknown Seller");

    get("detailsQuantity").value = 1;

    showMessage("detailsMessage", "");
    showPage("productDetails");
}


// =====================================
// 11. BUY NOW AND CHECKOUT
// =====================================

function openBuyNow(productId, quantity = 1) {
    if (!currentUser) {
        showPage("auth");
        return;
    }

    const product = products.find(item => item.id === productId);
    const qty = validQuantity(quantity);

    if (!product || product.status !== "active") {
        alert("Product is not available.");
        return;
    }

    if (product.seller_id === currentUser.id) {
        alert("You cannot buy your own product.");
        return;
    }

    if (!qty) {
        alert("Please enter a valid quantity.");
        return;
    }

    checkoutMode = false;

    checkoutItems = [{
        product: product,
        quantity: qty
    }];

    selectedProduct = product;

    get("buyNowModal").querySelector("h2").textContent =
        "Confirm Your Order";

    renderCheckoutItems();

    get("buyOrderMessage").textContent = "";
    get("confirmBuy").textContent = "Submit Order";
    get("confirmBuy").disabled = false;

    get("buyNowModal").classList.remove("hidden");
}


function openCartCheckout() {
    if (!currentUser) {
        alert("Please login first.");
        showPage("auth");
        return;
    }

    loadCart();

    if (cartItems.length === 0) {
        showMessage("cartMessage", "Your cart is empty.", "error");
        return;
    }

    const items = [];

    for (const item of cartItems) {
        const product = products.find(p => p.id === item.productId);

        if (!product || product.status !== "active") {
            showMessage(
                "cartMessage",
                "One or more products are no longer available.",
                "error"
            );
            return;
        }

        if (product.seller_id === currentUser.id) {
            showMessage(
                "cartMessage",
                "Your own product cannot be ordered.",
                "error"
            );
            return;
        }

        const quantity = validQuantity(item.quantity);

        if (!quantity) {
            showMessage(
                "cartMessage",
                "Please check your cart quantities.",
                "error"
            );
            return;
        }

        items.push({ product, quantity });
    }

    checkoutItems = items;
    checkoutMode = true;
    selectedProduct = null;

    get("buyNowModal").querySelector("h2").textContent =
        "Cart Checkout";

    renderCheckoutItems();

    get("buyOrderMessage").textContent = "";
    get("confirmBuy").textContent = "Place Order";
    get("confirmBuy").disabled = false;

    get("buyNowModal").classList.remove("hidden");
}

// PROCEED TO CART CHECKOUT
on("checkoutBtn", "click", openCartCheckout);


// DISPLAY CHECKOUT ITEMS


function renderCheckoutItems() {
    const titleContainer = get("buyProductTitle");
    const priceContainer = get("buyProductPrice");

    if (!titleContainer || !priceContainer) return;

    let total = 0;

    titleContainer.innerHTML = checkoutItems.map((item, index) => {
        const subtotal =
            Number(item.product.price) * item.quantity;

        total += subtotal;

        const imageUrl = item.product.image_url;

        return `
            <div style="
                padding: 14px 0;
                border-bottom: 1px solid #eee;
                text-align: left;
            ">

                <div style="
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    margin-bottom: 12px;
                ">

                    ${
                        imageUrl
                        ? `
                            <img
                                src="${escapeHTML(imageUrl)}"
                                alt="${escapeHTML(item.product.title)}"
                                style="
                                    width: 90px;
                                    height: 90px;
                                    object-fit: cover;
                                    border-radius: 10px;
                                    border: 1px solid #eee;
                                    flex-shrink: 0;
                                "
                                onerror="this.style.display='none'"
                            >
                        `
                        : `
                            <div style="
                                width: 90px;
                                height: 90px;
                                background: #f3effa;
                                border-radius: 10px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #7138c8;
                                font-size: 12px;
                                flex-shrink: 0;
                            ">
                                No Image
                            </div>
                        `
                    }

                    <div style="flex: 1; min-width: 0;">
                        <strong style="
                            display: block;
                            overflow-wrap: anywhere;
                        ">
                            ${escapeHTML(item.product.title)}
                        </strong>

                        <p style="
                            margin: 6px 0;
                            color: #777;
                            font-size: 14px;
                        ">
                            ${formatPrice(item.product.price)} each
                        </p>
                    </div>

                </div>

                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                ">

                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    ">

                        <button type="button"
                            onclick="changeCheckoutQuantity(${index}, -1)"
                            style="
                                width: 32px;
                                height: 32px;
                                border: 1px solid #7138c8;
                                border-radius: 6px;
                                background: white;
                                color: #7138c8;
                                cursor: pointer;
                                font-size: 18px;
                            ">
                            −
                        </button>

                        <strong>${item.quantity}</strong>

                        <button type="button"
                            onclick="changeCheckoutQuantity(${index}, 1)"
                            style="
                                width: 32px;
                                height: 32px;
                                border: 1px solid #7138c8;
                                border-radius: 6px;
                                background: #7138c8;
                                color: white;
                                cursor: pointer;
                                font-size: 18px;
                            ">
                            +
                        </button>

                    </div>

                    <div style="text-align: right;">
                        <strong>${formatPrice(subtotal)}</strong>
                        <small style="
                            display: block;
                            color: #777;
                        ">
                            Subtotal
                        </small>
                    </div>

                </div>

            </div>
        `;
    }).join("");

    priceContainer.textContent =
        "Total: " + formatPrice(total);
}


// CHANGE CHECKOUT QUANTITY


function changeCheckoutQuantity(index, change) {
    if (!checkoutItems[index]) return;

    const item = checkoutItems[index];

    const newQuantity = item.quantity + Number(change);

    if (newQuantity < 1) return;

    item.quantity = newQuantity;

    // Update cart only when using Cart Checkout.
    if (checkoutMode) {
        const cartItem = cartItems.find(
            cart => cart.productId === item.product.id
        );

        if (cartItem) {
            cartItem.quantity = newQuantity;
        }

        saveCart();
        renderCart();
    }

    // Refresh checkout display.
    renderCheckoutItems();
}

// PLACE ORDER




on("confirmBuy", "click", async function() {
    if (isSubmittingOrder) return;

    if (!db || !currentUser || !(await verifyAuthenticatedUser())) {
        showMessage("buyOrderMessage", "Please login first.", "error");
        return;
    }

    if (!checkoutItems.length) {
        showMessage("buyOrderMessage", "No products selected.", "error");
        return;
    }

    for (const item of checkoutItems) {
        if (!item.product || !validQuantity(item.quantity)) {
            showMessage("buyOrderMessage", "Invalid product or quantity.", "error");
            return;
        }

        if (item.product.seller_id === currentUser.id) {
            showMessage("buyOrderMessage", "You cannot order your own product.", "error");
            return;
        }
    }

    const button = get("confirmBuy");
    isSubmittingOrder = true;
    button.disabled = true;

    try {
        // One chat group per seller for this checkout.
        const chatGroupBySeller = new Map();

        const orderRows = checkoutItems.map(item => {
            const product = item.product;
            const sellerId = product.seller_id;
            const quantity = validQuantity(item.quantity);

            if (!product.id || !sellerId || !quantity) {
                throw new Error(
                    "An order item has missing product, seller, or quantity information."
                );
            }

            if (!chatGroupBySeller.has(sellerId)) {
                chatGroupBySeller.set(
                    sellerId,
                    crypto.randomUUID()
                );
            }

            // IMPORTANT: Return the order object.
return {
    buyer_id: currentUser.id,
    seller_id: sellerId,
    product_id: product.id,
    product_title: product.title,
    price: Number(product.price),
    quantity: quantity,
    status: "pending",
    meetup_location: null,
    chat_group_id: chatGroupBySeller.get(sellerId)
};
        });

        if (!Array.isArray(orderRows) || orderRows.length === 0) {
            throw new Error("No valid order items were created.");
        }

        console.log(
            "ORDER ROWS JSON:",
            JSON.stringify(orderRows, null, 2)
        );

        console.log(
            "ROW VALIDATION:",
            orderRows.map((row, index) => ({
                index: index,
                isNull: row == null,
                keys: row ? Object.keys(row) : null
            }))
        );

        const { error } = await db
            .from("orders")
            .insert(orderRows);

        if (error) throw error;

        if (checkoutMode) {
            cartItems = [];
            saveCart();
            renderCart();
        }

        checkoutItems = [];
        checkoutMode = false;

        get("buyNowModal").classList.add("hidden");

        showPage("myPurchases");

        showMessage(
            "purchasesMessage",
            "Order submitted successfully! You can now coordinate the meetup with the seller through chat.",
            "success"
        );

    } catch (error) {
        console.error("Checkout Error Details:", {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint
});

        showMessage(
            "buyOrderMessage",
            "Order failed: " + error.message,
            "error"
        );

    } finally {
        isSubmittingOrder = false;
        button.disabled = false;
    }
});

// =====================================
// 12. MY PURCHASES
// =====================================


async function loadMyPurchases() {
    const grid = get("myPurchasesGrid");
    if (!grid) return;

    if (!currentUser || !db) {
        grid.innerHTML = "";
        showMessage(
            "purchasesMessage",
            "Please login to view your purchases."
        );
        return;
    }

    grid.innerHTML = "<p>Loading your purchases...</p>";

    try {
        const { data: orders, error } = await db
            .from("orders")
            .select(`
                id,
                product_title,
                price,
                quantity,
                status,
                meetup_location,
                seller_id,
                chat_group_id,
                created_at
            `)
            .eq("buyer_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!orders?.length) {
            grid.innerHTML = "<p>You have no purchases yet.</p>";
            showMessage("purchasesMessage", "");
            return;
        }

        // Get seller information
        const sellerIds = [
            ...new Set(orders.map(o => o.seller_id).filter(Boolean))
        ];

        let sellers = [];

        if (sellerIds.length) {
            const { data, error: sellerError } = await db
                .from("profiles")
                .select("id, full_name")
                .in("id", sellerIds);

            if (sellerError) throw sellerError;
            sellers = data || [];
        }

        // Group orders using chat_group_id
        const groupedOrders = new Map();

        orders.forEach(order => {
            const groupKey = order.chat_group_id
                ? order.chat_group_id
                : "single-" + order.id;

            if (!groupedOrders.has(groupKey)) {
                groupedOrders.set(groupKey, []);
            }

            groupedOrders.get(groupKey).push(order);
        });

        const purchaseGroups = Array.from(groupedOrders.values());

        // Find the oldest order ID for each shared conversation
        purchaseGroups.forEach(group => {
            group.sort((a, b) =>
                new Date(a.created_at || 0) -
                new Date(b.created_at || 0)
            );
        });

        // Get unread count per purchase group
        const unreadCounts = await Promise.all(
            purchaseGroups.map(group =>
                getUnreadMessageCount(group[0].id)
            )
        );

        // Display one card per purchase group
        grid.innerHTML = purchaseGroups.map((group, index) => {
            const firstOrder = group[0];

            const seller = sellers.find(
                p => p.id === firstOrder.seller_id
            );

            const unreadCount = unreadCounts[index];

            const total = group.reduce((sum, order) => {
                return sum +
                    (Number(order.price) * Number(order.quantity || 1));
            }, 0);

            const date = firstOrder.created_at
                ? new Date(firstOrder.created_at).toLocaleString("en-PH")
                : "-";

            const productList = group.map(order => {
                const quantity = Number(order.quantity || 1);
                const subtotal = Number(order.price) * quantity;
                const status = (order.status || "pending").toLowerCase();

                return `
                    <div style="
                        padding: 10px 0;
                        border-bottom: 1px solid #eee;
                    ">
                        <strong>${escapeHTML(order.product_title)}</strong>

                        <p>Price: ${formatPrice(order.price)}</p>
                        <p>Quantity: ${quantity}</p>

                        <p>Subtotal:
                            <strong>${formatPrice(subtotal)}</strong>
                        </p>

                        <p>Status:
                            <span class="status-badge status-${escapeHTML(status)}">
                                ${escapeHTML(status.toUpperCase())}
                            </span>
                        </p>

                        <p>
    Meet-up Location:
    <strong>
        ${order.meetup_location
            ? escapeHTML(order.meetup_location)
            : "To be discussed"
        }
    </strong>
</p>
                    </div>
                `;
            }).join("");

            return `
                <div class="order-card">

                    <h3>
                        ${group.length} Product(s) in One Order
                    </h3>

                    ${productList}

                    <p>
                        <strong>Grand Total: ${formatPrice(total)}</strong>
                    </p>

                    <p>
                        Seller:
                        ${escapeHTML(seller?.full_name || "Unknown Seller")}
                    </p>

                    <p>Order Date: ${escapeHTML(date)}</p>

                    <button class="btn-primary"
                        onclick="openOrderChat('${firstOrder.id}')">

                        Chat Seller

                        ${unreadCount > 0
                            ? `<span class="unread-chat-badge">${unreadCount}</span>`
                            : ""
                        }

                    </button>

                </div>
            `;
        }).join("");

        showMessage(
            "purchasesMessage",
            purchaseGroups.length + " purchase group(s) found."
        );

    } catch (error) {
        console.error("My Purchases Error:", error);
        grid.innerHTML = "";

        showMessage(
            "purchasesMessage",
            "Unable to load purchases: " + error.message,
            "error"
        );
    }
}

// =====================================
// 13. INCOMING ORDERS
// =====================================


async function loadIncomingOrders() {
    const grid = get("incomingOrdersGrid");
    if (!grid) return;

    if (!currentUser || !db) {
        grid.innerHTML = "";
        showMessage(
            "incomingOrdersMessage",
            "Please login to view incoming orders."
        );
        return;
    }

    grid.innerHTML = "<p>Loading incoming orders...</p>";

    try {
        const { data: orders, error } = await db
            .from("orders")
            .select(`
                id,
                product_title,
                price,
                quantity,
                status,
                meetup_location,
                buyer_id,
                seller_id,
                chat_group_id,
                created_at
            `)
            .eq("seller_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!orders || orders.length === 0) {
            grid.innerHTML = "<p>No incoming orders yet.</p>";
            showMessage("incomingOrdersMessage", "");
            return;
        }

        // GET BUYER INFORMATION
        const buyerIds = [
            ...new Set(orders.map(o => o.buyer_id).filter(Boolean))
        ];

        let buyers = [];

        if (buyerIds.length) {
            const { data, error: buyerError } = await db
                .from("profiles")
                .select("id, full_name")
                .in("id", buyerIds);

            if (buyerError) throw buyerError;
            buyers = data || [];
        }

        // GROUP ORDERS USING CHAT GROUP ID
        const groupedOrders = new Map();

        orders.forEach(order => {
            const groupKey = order.chat_group_id
                ? order.chat_group_id
                : "single-" + order.id;

            if (!groupedOrders.has(groupKey)) {
                groupedOrders.set(groupKey, []);
            }

            groupedOrders.get(groupKey).push(order);
        });

        const orderGroups = Array.from(groupedOrders.values());

        // SORT EACH GROUP FROM OLDEST TO NEWEST
        orderGroups.forEach(group => {
            group.sort((a, b) =>
                new Date(a.created_at || 0) -
                new Date(b.created_at || 0)
            );
        });

        // GET UNREAD COUNT PER GROUP
        const unreadCounts = await Promise.all(
            orderGroups.map(group =>
                getUnreadMessageCount(group[0].id)
            )
        );

        // DISPLAY ONE CARD PER GROUP
        grid.innerHTML = orderGroups.map((group, index) => {

            const firstOrder = group[0];

            const buyer = buyers.find(
                p => p.id === firstOrder.buyer_id
            );

            const unreadCount = unreadCounts[index];

            // COMPUTE GRAND TOTAL
            const grandTotal = group.reduce((sum, order) => {
                return sum +
                    (Number(order.price) *
                    Number(order.quantity || 1));
            }, 0);

            // ORDER DATE
            const date = firstOrder.created_at
                ? new Date(firstOrder.created_at).toLocaleString("en-PH")
                : "-";

            // MEET-UP LOCATION
            const meetupLocation =
                group.find(order => order.meetup_location)?.meetup_location
                || "To be discussed";

            // DISPLAY ALL PRODUCTS
            const productList = group.map(order => {

                const quantity = Number(order.quantity || 1);
                const subtotal = Number(order.price) * quantity;
                const status = (order.status || "pending").toLowerCase();

                let actions = "";

                if (status === "pending") {
                    actions = `
                        <div class="order-actions">
                            <button class="btn-primary"
                                onclick="updateOrderStatus('${order.id}', 'accepted')">
                                Accept
                            </button>

                            <button class="btn-danger"
                                onclick="updateOrderStatus('${order.id}', 'rejected')">
                                Reject
                            </button>
                        </div>
                    `;
                } else if (status === "accepted") {
                    actions = `
                        <div class="order-actions">
                            <button class="btn-primary"
                                onclick="updateOrderStatus('${order.id}', 'completed')">
                                Mark as Completed
                            </button>
                        </div>
                    `;
                }

                return `
                    <div style="
                        padding: 15px 0;
                        border-bottom: 1px solid #eee;
                    ">

                        <strong>
                            ${escapeHTML(order.product_title)}
                        </strong>

                        <p>Price:
                            <strong>${formatPrice(order.price)}</strong>
                        </p>

                        <p>Quantity: ${quantity}</p>

                        <p>Subtotal:
                            <strong>${formatPrice(subtotal)}</strong>
                        </p>

                        <p>Status:
                            <span class="status-badge status-${escapeHTML(status)}">
                                ${escapeHTML(status.toUpperCase())}
                            </span>
                        </p>

                        ${actions}

                    </div>
                `;
            }).join("");

            return `
                <div class="order-card">

                    <h3>
                        ${group.length} Product(s) in One Order
                    </h3>

                    ${productList}

                    <p>
                        <strong>
                            Grand Total: ${formatPrice(grandTotal)}
                        </strong>
                    </p>

                    <p>
                        Buyer:
                        ${escapeHTML(buyer?.full_name || "Unknown Buyer")}
                    </p>

                    <p>
                        Meet-up Location:
                        <strong>${escapeHTML(meetupLocation)}</strong>
                    </p>

                    <p>Order Date: ${escapeHTML(date)}</p>

                    <button class="btn-primary"
                        onclick="openOrderChat('${firstOrder.id}')">

                        Chat Buyer

                        ${unreadCount > 0
                            ? `<span class="unread-chat-badge">${unreadCount}</span>`
                            : ""
                        }

                    </button>

                </div>
            `;
        }).join("");

        showMessage(
            "incomingOrdersMessage",
            orderGroups.length + " incoming order group(s) found."
        );

    } catch (error) {
        console.error("Incoming Orders Error:", error);

        grid.innerHTML = "";

        showMessage(
            "incomingOrdersMessage",
            "Unable to load incoming orders: " + error.message,
            "error"
        );
    }
}

// =====================================
// 14. CUSTOM ORDER POPUP
// =====================================

function showOrderPopup({
    title = "UniTrade",
    message = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    isConfirm = false,
    isError = false
} = {}) {

    let modal = get("orderCustomPopup");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "orderCustomPopup";

        modal.innerHTML = `
            <div class="order-popup-overlay">
                <div class="order-popup-box">
                    <div class="order-popup-icon" id="orderPopupIcon">✓</div>

                    <h3 id="orderPopupTitle">UniTrade</h3>

                    <p id="orderPopupMessage"></p>

                    <div class="order-popup-buttons">
                        <button id="orderPopupCancel" class="order-popup-cancel">
                            Cancel
                        </button>

                        <button id="orderPopupConfirm" class="order-popup-confirm">
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const style = document.createElement("style");

        style.textContent = `
            #orderCustomPopup {
                position: fixed;
                inset: 0;
                z-index: 99999;
            }

            .order-popup-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.55);
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }

            .order-popup-box {
                background: white;
                width: 100%;
                max-width: 380px;
                padding: 28px 24px;
                border-radius: 18px;
                text-align: center;
                box-shadow: 0 10px 35px rgba(0,0,0,0.2);
                animation: orderPopupShow 0.2s ease;
            }

            .order-popup-icon {
                width: 55px;
                height: 55px;
                border-radius: 50%;
                background: #eee5ff;
                color: #7138c8;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                font-weight: bold;
                margin: 0 auto 15px;
            }

            .order-popup-box h3 {
                color: #54219c;
                margin-bottom: 10px;
            }

            .order-popup-box p {
                color: #555;
                line-height: 1.5;
                margin-bottom: 22px;
            }

            .order-popup-buttons {
                display: flex;
                justify-content: center;
                gap: 10px;
            }

            .order-popup-buttons button {
                border: none;
                padding: 11px 20px;
                border-radius: 9px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
            }

            .order-popup-confirm {
                background: #7138c8;
                color: white;
            }

            .order-popup-confirm:hover {
                background: #5726a3;
            }

            .order-popup-cancel {
                background: #eee;
                color: #444;
            }

            .order-popup-cancel:hover {
                background: #ddd;
            }

            @keyframes orderPopupShow {
                from {
                    opacity: 0;
                    transform: scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
        `;

        document.head.appendChild(style);
    }

    const popupTitle = get("orderPopupTitle");
    const popupMessage = get("orderPopupMessage");
    const popupIcon = get("orderPopupIcon");
    const confirmButton = get("orderPopupConfirm");
    const cancelButton = get("orderPopupCancel");

    popupTitle.textContent = title;
    popupMessage.textContent = message;

    popupIcon.textContent = isError ? "!" : (isConfirm ? "?" : "✓");

    confirmButton.textContent = confirmText;
    cancelButton.textContent = cancelText;

    cancelButton.style.display = isConfirm ? "inline-block" : "none";

    modal.style.display = "block";

    return new Promise(resolve => {
        function closePopup(result) {
            modal.style.display = "none";

            confirmButton.removeEventListener("click", confirmHandler);
            cancelButton.removeEventListener("click", cancelHandler);

            resolve(result);
        }

        function confirmHandler() {
            closePopup(true);
        }

        function cancelHandler() {
            closePopup(false);
        }

        confirmButton.addEventListener("click", confirmHandler);
        cancelButton.addEventListener("click", cancelHandler);
    });
}


// =====================================
// 15. UPDATE ORDER STATUS
// =====================================

async function updateOrderStatus(orderId, newStatus) {
    if (!db || !currentUser || !(await verifyAuthenticatedUser())) {
        await showOrderPopup({
            title: "Login Required",
            message: "Please login first.",
            isError: true
        });
        return;
    }

    const validStatuses = ["accepted", "rejected", "completed"];

    if (!validStatuses.includes(newStatus)) {
        await showOrderPopup({
            title: "Invalid Status",
            message: "The selected order status is invalid.",
            isError: true
        });
        return;
    }

    let actionMessage = "";

    if (newStatus === "accepted") {
        actionMessage = "Are you sure you want to accept this order?";
    } else if (newStatus === "rejected") {
        actionMessage = "Are you sure you want to reject this order?";
    } else {
        actionMessage =
            "Are you sure you want to mark this order as completed?";
    }

    const confirmed = await showOrderPopup({
        title: "Confirm Order Action",
        message: actionMessage,
        confirmText: "Yes, Continue",
        cancelText: "Cancel",
        isConfirm: true
    });

    if (!confirmed) return;

    try {
        const { data, error } = await db
            .from("orders")
            .update({ status: newStatus })
            .eq("id", orderId)
            .eq("seller_id", currentUser.id)
            .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(
                "Order was not updated. Please check your permissions."
            );
        }

        await loadIncomingOrders();

        let successMessage = "";

        if (newStatus === "accepted") {
            successMessage = "You have successfully accepted the order.";
        } else if (newStatus === "rejected") {
            successMessage = "The order has been rejected.";
        } else {
            successMessage = "The order has been marked as completed.";
        }

        await showOrderPopup({
            title: "Success!",
            message: successMessage,
            confirmText: "Okay"
        });

    } catch (error) {
        console.error("Update Order Error:", error);

        await showOrderPopup({
            title: "Update Failed",
            message: "Unable to update order: " + error.message,
            confirmText: "Okay",
            isError: true
        });
    }
}


// =====================================
// 16. SHOPPING CART
// =====================================

function getCartStorageKey() {
    if (!currentUser) return null;

    return `unitrade_cart_${currentUser.id}`;
}

function loadCart() {
    try {
        const cartKey = getCartStorageKey();

        if (!cartKey) {
            cartItems = [];
            return;
        }

        const savedCart = JSON.parse(
            localStorage.getItem(cartKey) || "[]"
        );

        if (!Array.isArray(savedCart)) {
            cartItems = [];
            return;
        }

        cartItems = savedCart.map(item => {
            if (typeof item === "string") {
                return {
                    productId: item,
                    quantity: 1
                };
            }

            return {
                productId: item.productId,
                quantity: validQuantity(item.quantity) || 1
            };
        }).filter(item => item.productId);

    } catch (error) {
        console.error("Cart loading error:", error);
        cartItems = [];
    }
}

function saveCart() {
    const cartKey = getCartStorageKey();

    if (!cartKey) return;

    try {
        localStorage.setItem(
            cartKey,
            JSON.stringify(cartItems)
        );
    } catch (error) {
        console.error("Cart saving error:", error);
        alert("Unable to save your cart in this browser.");
    }
}


// ADD TO CART

function addToCart(productId, quantity = 1) {
    if (!currentUser) {
        alert("Please login first.");
        return;
    }

    const product = products.find(item => item.id === productId);
    const qty = validQuantity(quantity);

    if (!product || product.status !== "active") {
        alert("Product is not available.");
        return;
    }

    if (product.seller_id === currentUser.id) {
        alert("You cannot add your own product to cart.");
        return;
    }

    if (!qty) {
        alert("Please enter a valid quantity.");
        return;
    }

    loadCart();

    const existingItem = cartItems.find(
        item => item.productId === productId
    );

    if (existingItem) {
        existingItem.quantity += qty;
    } else {
        cartItems.push({
            productId: productId,
            quantity: qty
        });
    }

    saveCart();
    renderCart();

    if (get("cartAddedModal")) {
        get("cartAddedModal").classList.remove("hidden");
    }
}


// DISPLAY CART

function renderCart() {
    const cartGrid = get("cartGrid");
    const cartTotal = get("cartTotal");
    const navCartBadge = get("navCartBadge");

    const cartProducts = cartItems.map(item => {
        const product = products.find(p => p.id === item.productId);

        return product
            ? {
                product,
                quantity: validQuantity(item.quantity) || 1
            }
            : null;
    }).filter(item => item && item.product.status === "active");

    const totalQty = cartProducts.reduce((sum, item) => sum + item.quantity, 0);
    if (navCartBadge) {
        navCartBadge.textContent = totalQty;
        navCartBadge.classList.toggle("hidden", totalQty === 0);
    }

    if (!cartGrid || !cartTotal) return;

    let total = 0;

    if (!cartProducts.length) {
        cartGrid.innerHTML = "<p>Your cart is empty.</p>";
        cartTotal.textContent = formatPrice(0);
        return;
    }

    cartGrid.innerHTML = cartProducts.map(item => {
        const product = item.product;
        const quantity = item.quantity;
        const subtotal = Number(product.price) * quantity;

        total += subtotal;

        const image = product.image_url
            ? `<img src="${escapeHTML(product.image_url)}" alt="${escapeHTML(product.title)}">`
            : "📦";

        return `
            <div class="product-card">
                <div class="product-image">${image}</div>

                <div class="product-info">
                    <h3>${escapeHTML(product.title)}</h3>

                    <div class="product-price">
                        ${formatPrice(product.price)}
                    </div>

                    <div class="quantity-control">
                        <button type="button"
                            onclick="changeCartQuantity('${product.id}', -1)">
                            −
                        </button>

                        <span>${quantity}</span>

                        <button type="button"
                            onclick="changeCartQuantity('${product.id}', 1)">
                            +
                        </button>
                    </div>

                    <p>Subtotal:
                        <strong>${formatPrice(subtotal)}</strong>
                    </p>

                    <button class="btn-danger"
                        onclick="removeFromCart('${product.id}')">
                        Remove
                    </button>
                </div>
            </div>
        `;
    }).join("");

    cartTotal.textContent = formatPrice(total);
}


// CHANGE CART QUANTITY

function changeCartQuantity(productId, change) {
    loadCart();

    const item = cartItems.find(
        item => item.productId === productId
    );

    if (!item) return;

    const newQuantity = Number(item.quantity) + Number(change);

    if (newQuantity < 1) return;

    item.quantity = newQuantity;

    saveCart();
    renderCart();
}


// REMOVE FROM CART

function removeFromCart(productId) {
    loadCart();

    cartItems = cartItems.filter(
        item => item.productId !== productId
    );

    saveCart();
    renderCart();
}


// PRODUCT DETAILS - ADD TO CART

on("addToCartBtn", "click", function() {
    if (!selectedProduct) {
        alert("Please select a product first.");
        return;
    }

    const quantity = validQuantity(get("detailsQuantity").value);

    if (!quantity) {
        alert("Please enter a valid quantity.");
        return;
    }

    addToCart(selectedProduct.id, quantity);
});


// PRODUCT DETAILS - BUY NOW

on("detailsBuyNowBtn", "click", function() {
    if (!selectedProduct) {
        alert("Please select a product first.");
        return;
    }

    const quantity = validQuantity(get("detailsQuantity").value);

    if (!quantity) {
        alert("Please enter a valid quantity.");
        return;
    }

    openBuyNow(selectedProduct.id, quantity);
});


// =====================================
// 17. EDIT PRODUCT
// =====================================

async function editProduct(id) {
    if (!db || !currentUser) return;

    try {
        const { data: product, error } = await db
            .from("products")
            .select("*")
            .eq("id", id)
            .single();

        if (error) throw error;

        if (product.seller_id !== currentUser.id) {
            alert("You can only edit your own listings.");
            return;
        }

        editingProductId = id;
        editingImageFile = null;

        get("editProductName").value = product.title || "";
        get("editProductPrice").value = product.price || "";
        get("editProductCategory").value = product.category || "";
        get("editProductDescription").value = product.description || "";
        get("editProductImage").value = "";

        const preview = get("editProductImagePreview");

        preview.src = product.image_url || "";
        preview.style.display = product.image_url ? "block" : "none";

        get("editProductMessage").textContent = "";
        get("editProductModal").classList.remove("hidden");

    } catch (error) {
        alert("Unable to load product: " + error.message);
    }
}


on("editProductImage", "change", function() {
    const file = this.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        get("editProductMessage").textContent =
            "Please select a valid image.";

        this.value = "";
        editingImageFile = null;
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        get("editProductMessage").textContent =
            "Image must not exceed 5MB.";

        this.value = "";
        editingImageFile = null;
        return;
    }

    editingImageFile = file;

    const preview = get("editProductImagePreview");
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";

    get("editProductMessage").textContent = "";
});


on("cancelEdit", "click", function() {
    editingProductId = null;
    editingImageFile = null;
    get("editProductModal").classList.add("hidden");
});


on("saveEdit", "click", async function() {
    if (!editingProductId || !currentUser) return;
    if (!(await verifyAuthenticatedUser())) return;

    const title = get("editProductName").value.trim();
    const price = Number(get("editProductPrice").value);
    const category = get("editProductCategory").value.trim();
    const description = get("editProductDescription").value.trim();

    const message = get("editProductMessage");
    const button = get("saveEdit");

    message.textContent = "";

    if (!title || !category || !Number.isFinite(price) || price <= 0) {
        message.textContent =
            "Please enter a valid product name, price, and category.";
        return;
    }

    button.disabled = true;

    try {
        let imageUrl;

        if (editingImageFile) {
            const extension = editingImageFile.name
                .split(".")
                .pop()
                .toLowerCase();

            const filePath =
                `${currentUser.id}/${Date.now()}.${extension}`;

            const { error: uploadError } = await db.storage
                .from("product-images")
                .upload(filePath, editingImageFile, {
                    cacheControl: "3600",
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data: imageData } = db.storage
                .from("product-images")
                .getPublicUrl(filePath);

            imageUrl = imageData.publicUrl;
        }

        const updatedProduct = {
            title,
            price,
            category,
            description
        };

        if (imageUrl !== undefined) {
            updatedProduct.image_url = imageUrl;
        }

        const { error } = await db
            .from("products")
            .update(updatedProduct)
            .eq("id", editingProductId)
            .eq("seller_id", currentUser.id);

        if (error) throw error;

        editingProductId = null;
        editingImageFile = null;

        get("editProductModal").classList.add("hidden");

        await loadProducts();
        await loadMyListings();

        if (currentProfile?.role === "admin") {
            await loadAdminDashboard();
        }

    } catch (error) {
        message.textContent = "Update failed: " + error.message;

    } finally {
        button.disabled = false;
    }
});


// =====================================
// 18. DISPLAY PRODUCTS
// =====================================

function displayProducts() {
    if (!currentUser) return;

    const search = get("searchInput")
        ? get("searchInput").value.trim().toLowerCase()
        : "";

    const category = get("categoryFilter")
        ? get("categoryFilter").value
        : "all";

    const filtered = products.filter(product => {
        const matchesSearch =
            (product.title || "").toLowerCase().includes(search) ||
            (product.description || "").toLowerCase().includes(search) ||
            (product.category || "").toLowerCase().includes(search);

        const matchesCategory =
            !category ||
            category === "all" ||
            product.category === category;

        const isNotOwnProduct =
            !currentUser || product.seller_id !== currentUser.id;

        return matchesSearch && matchesCategory && isNotOwnProduct;
    });

    const featuredGrid = get("featuredProductsGrid");
    if (featuredGrid) {
        const featuredList = filtered.slice(0, 4);
        featuredGrid.innerHTML = featuredList.length
            ? featuredList.map(product => createProductCard(product)).join("")
            : `<p class="empty-grid-note">No featured products match your search yet.</p>`;
    }

    const recentGrid = get("recentProductsGrid");
    if (recentGrid) {
        const recentList = filtered.slice(0, 4);
        recentGrid.innerHTML = recentList.length
            ? recentList.map(product => createProductCard(product)).join("")
            : `<p class="empty-grid-note">No recent listings found.</p>`;
    }

    const popularGrid = get("popularProductsGrid");
    const popularSection = get("popularHomeSection");
    if (popularGrid && popularSection) {
        const popularList = filtered.slice(4, 8);
        if (popularList.length > 0) {
            popularSection.classList.remove("hidden");
            popularGrid.innerHTML = popularList.map(product => createProductCard(product)).join("");
        } else {
            popularSection.classList.add("hidden");
            popularGrid.innerHTML = "";
        }
    }

    const productGrid = get("productGrid");
    if (productGrid) {
        productGrid.innerHTML = filtered
            .map(product => createProductCard(product))
            .join("");
    }

    if (get("homeMessage")) {
        get("homeMessage").textContent =
            filtered.length === 0
                ? "No products found."
                : "";
    }

    displayExploreProducts();
}

function displayExploreProducts() {
    if (!currentUser) return;

    const exploreGrid = get("exploreProductGrid");
    if (!exploreGrid) return;

    const search = (get("exploreSearchInput")?.value || "").trim().toLowerCase();
    const category = get("exploreCategoryFilter")?.value || "all";
    const condition = get("exploreConditionFilter")?.value || "all";
    const availability = get("exploreAvailabilityFilter")?.value || "all";
    const sortBy = get("exploreSortSelect")?.value || "newest";

    let filtered = products.filter(product => {
        const matchesSearch =
            !search ||
            (product.title || "").toLowerCase().includes(search) ||
            (product.description || "").toLowerCase().includes(search) ||
            (product.category || "").toLowerCase().includes(search);

        const matchesCategory =
            category === "all" || product.category === category;

        const matchesCondition =
            condition === "all" || (product.condition || "") === condition;

        const stock = typeof product.stock_quantity === "number" ? product.stock_quantity : 1;
        let matchesAvailability = true;
        if (availability === "available") matchesAvailability = stock > 0;
        else if (availability === "low_stock") matchesAvailability = stock > 0 && stock <= 3;
        else if (availability === "sold") matchesAvailability = stock <= 0;

        const isNotOwnProduct =
            !currentUser || product.seller_id !== currentUser.id;

        return matchesSearch && matchesCategory && matchesCondition && matchesAvailability && isNotOwnProduct;
    });

    if (sortBy === "price_asc") {
        filtered = [...filtered].sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === "price_desc") {
        filtered = [...filtered].sort((a, b) => Number(b.price) - Number(a.price));
    } else {
        filtered = [...filtered].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    exploreGrid.innerHTML = filtered.length
        ? filtered.map(product => createProductCard(product)).join("")
        : `<p class="empty-grid-note">No matching products found.</p>`;

    if (get("exploreMessage")) {
        get("exploreMessage").textContent =
            filtered.length === 1
                ? "1 product found"
                : `${filtered.length} products found`;
    }
}

function openExploreCategory(category) {
    if (!currentUser) {
        showPage("auth");
        return;
    }
    if (get("exploreCategoryFilter")) {
        get("exploreCategoryFilter").value = category || "all";
    }
    showPage("explore");
}

function openExploreSorted(sortBy) {
    if (!currentUser) {
        showPage("auth");
        return;
    }
    if (get("exploreSortSelect")) {
        get("exploreSortSelect").value = sortBy || "newest";
    }
    showPage("explore");
}

function toggleMobileSidebar(forceOpen) {
    const sidebar = get("appSidebar");
    const backdrop = get("sidebarBackdrop");
    const btn = get("mobileMenuBtn");
    if (!sidebar) return;

    const shouldOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : !sidebar.classList.contains("open");

    sidebar.classList.toggle("open", shouldOpen);
    if (backdrop) backdrop.classList.toggle("hidden", !shouldOpen);
    if (btn) btn.setAttribute("aria-expanded", String(shouldOpen));
}

function closeProfileDropdown() {
    const dropdown = get("profileMenuDropdown");
    const btn = get("profileMenuBtn");
    if (dropdown) dropdown.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
}

function setMyListingsView(mode) {
    const grid = get("myProductGrid");
    const tableWrap = get("myListingsTableWrap");
    const cardsBtn = get("myListingsViewCardsBtn");
    const tableBtn = get("myListingsViewTableBtn");
    const isTable = mode === "table";

    if (grid) grid.classList.toggle("hidden", isTable);
    if (tableWrap) tableWrap.classList.toggle("hidden", !isTable);
    if (cardsBtn) cardsBtn.classList.toggle("active", !isTable);
    if (tableBtn) tableBtn.classList.toggle("active", isTable);
}

on("profileMenuBtn", "click", function(event) {
    event.stopPropagation();
    const dropdown = get("profileMenuDropdown");
    const btn = get("profileMenuBtn");
    if (!dropdown) return;
    const isHidden = dropdown.classList.toggle("hidden");
    if (btn) btn.setAttribute("aria-expanded", String(!isHidden));
});

document.addEventListener("click", function(event) {
    const wrapper = get("profileMenuWrapper");
    if (wrapper && !wrapper.contains(event.target)) {
        closeProfileDropdown();
    }
});

on("searchInput", "input", function() {
    if (!currentUser) {
        this.value = "";
        showPage("auth");
        return;
    }
    displayProducts();
});
on("searchInput", "keydown", function(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        if (!currentUser) {
            this.value = "";
            showPage("auth");
            return;
        }
        if (get("exploreSearchInput")) {
            get("exploreSearchInput").value = this.value;
        }
        showPage("explore");
    }
});
on("categoryFilter", "change", displayProducts);
on("exploreSearchInput", "input", displayExploreProducts);
on("exploreCategoryFilter", "change", displayExploreProducts);
on("exploreConditionFilter", "change", displayExploreProducts);
on("exploreAvailabilityFilter", "change", displayExploreProducts);
on("exploreSortSelect", "change", displayExploreProducts);
on("clearExploreFiltersBtn", "click", function() {
    if (get("exploreSearchInput")) get("exploreSearchInput").value = "";
    if (get("exploreCategoryFilter")) get("exploreCategoryFilter").value = "all";
    if (get("exploreConditionFilter")) get("exploreConditionFilter").value = "all";
    if (get("exploreAvailabilityFilter")) get("exploreAvailabilityFilter").value = "all";
    if (get("exploreSortSelect")) get("exploreSortSelect").value = "newest";
    displayExploreProducts();
});


// =====================================
// 19. SELL PRODUCT
// =====================================

function updateSellPage() {
    const form = get("productForm");
    if (!form) return;

    if (!currentUser) {
        form.classList.add("hidden");
        showMessage(
            "sellMessage",
            "Please login before posting a product."
        );
    } else {
        form.classList.remove("hidden");
        showMessage("sellMessage", "");
    }
}


on("productForm", "submit", async function(event) {
    event.preventDefault();

    if (!db || !currentUser || !(await verifyAuthenticatedUser())) {
        showMessage("sellMessage", "Please login first.", "error");
        return;
    }

    const button = event.submitter ||
        get("productForm").querySelector('button[type="submit"]');

    const imageFile = get("productImageFile").files[0];
    const price = Number(get("productPrice").value);

    if (!Number.isFinite(price) || price <= 0) {
        showMessage("sellMessage", "Enter a valid price.", "error");
        return;
    }

    if (imageFile) {
        if (!imageFile.type.startsWith("image/")) {
            showMessage(
                "sellMessage",
                "Please select a valid image.",
                "error"
            );
            return;
        }

        if (imageFile.size > 5 * 1024 * 1024) {
            showMessage(
                "sellMessage",
                "Image must not exceed 5MB.",
                "error"
            );
            return;
        }
    }

    button.disabled = true;

    try {
        let imageUrl = null;

        if (imageFile) {
            const extension = imageFile.name
                .split(".")
                .pop()
                .toLowerCase();

            const filePath =
                `${currentUser.id}/${Date.now()}.${extension}`;

            const { error: uploadError } = await db.storage
                .from("product-images")
                .upload(filePath, imageFile, {
                    cacheControl: "3600",
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data: publicData } = db.storage
                .from("product-images")
                .getPublicUrl(filePath);

            imageUrl = publicData.publicUrl;
        }

        const product = {
            seller_id: currentUser.id,
            title: get("productName").value.trim(),
            price,
            category: get("productCategory").value,
            image_url: imageUrl,
            description: get("productDescription").value.trim(),
            status: "active",
            stock_quantity: Number(get("productStock")?.value || 1),
            condition: get("productCondition")?.value || "Good Condition"
        };

        const { error } = await db
            .from("products")
            .insert(product);

        if (error) throw error;

        get("productForm").reset();

        showMessage(
            "sellMessage",
            "Your product has been published!",
            "success"
        );

        await loadProducts();

    } catch (error) {
        console.error("Post Product Error:", error);
        showMessage("sellMessage", error.message, "error");

    } finally {
        button.disabled = false;
    }
});


on("productImageFile", "change", function() {
    const preview = get("sellImagePreview");
    if (!preview) return;
    const file = this.files[0];
    if (!file || !file.type.startsWith("image/")) {
        preview.innerHTML = `
            <div class="sell-image-preview-empty">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>Image preview will appear here</span>
            </div>
        `;
        return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="Selected product preview">`;
});


// =====================================
// 20. MY LISTINGS
// =====================================

async function loadMyListings() {
    const grid = get("myProductGrid");
    if (!grid) return;

    if (!db || !currentUser) {
        grid.innerHTML = "";
        if (get("myListingsTableBody")) get("myListingsTableBody").innerHTML = "";
        showMessage("myMessage", "Please login to view your listings.");
        return;
    }

    try {
        const { data, error } = await db
            .from("products")
            .select(`
                id,
                title,
                description,
                price,
                category,
                image_url,
                seller_id,
                status,
                stock_quantity,
                condition,
                profiles(full_name, role)
            `)
            .eq("seller_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const listings = data || [];

        grid.innerHTML = listings
            .map(product => createProductCard(product, true))
            .join("");

        const activeCount = listings.filter(p => p.status === "active").length;
        const totalStock = listings.reduce((sum, p) => sum + (typeof p.stock_quantity === "number" ? Math.max(0, p.stock_quantity) : 1), 0);
        const soldCount = listings.filter(p => typeof p.stock_quantity === "number" && p.stock_quantity <= 0).length;

        if (get("myListingsActiveCount")) get("myListingsActiveCount").textContent = activeCount;
        if (get("myListingsTotalCount")) get("myListingsTotalCount").textContent = listings.length;
        if (get("myListingsTotalStock")) get("myListingsTotalStock").textContent = totalStock;
        if (get("myListingsSoldCount")) get("myListingsSoldCount").textContent = soldCount;

        const tableBody = get("myListingsTableBody");
        if (tableBody) {
            tableBody.innerHTML = listings.length
                ? listings.map(product => {
                    const qty = typeof product.stock_quantity === "number" ? product.stock_quantity : 1;
                    const availText = qty <= 0 ? "Out of stock" : product.status === "hidden" ? "Hidden" : "Available";
                    return `
                        <tr>
                            <td><strong>${escapeHTML(product.title || "")}</strong></td>
                            <td>${escapeHTML(product.category || "—")}</td>
                            <td class="tabular-nums">${formatPrice(product.price)}</td>
                            <td>${escapeHTML(product.condition || "Good Condition")}</td>
                            <td class="tabular-nums">${qty}</td>
                            <td><span class="condition-badge">${escapeHTML(availText)}</span></td>
                            <td>
                                <div class="table-actions-inline">
                                    <button type="button" class="btn-outline btn-sm" onclick="editProduct('${product.id}')">Edit</button>
                                    <button type="button" class="btn-danger btn-sm" onclick="deleteProduct('${product.id}')">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("")
                : `<tr><td colspan="7">You have no listings yet.</td></tr>`;
        }

        showMessage(
            "myMessage",
            !listings.length
                ? "You have no listings yet."
                : "You have " + listings.length + " listing(s)."
        );

    } catch (error) {
        showMessage("myMessage", error.message, "error");
    }
}


// =====================================
// 21. DELETE PRODUCT
// =====================================

function deleteProduct(id) {
    if (!db || !currentUser) return;

    pendingDeleteId = id;
    get("deleteConfirmModal").classList.remove("hidden");
}

on("cancelDelete", "click", function() {
    pendingDeleteId = null;
    get("deleteConfirmModal").classList.add("hidden");
});


on("confirmDelete", "click", async function() {
    if (!pendingDeleteId || !currentUser) return;
    if (!(await verifyAuthenticatedUser())) return;

    const button = get("confirmDelete");
    button.disabled = true;

    try {
        const { error } = await db
            .from("products")
            .delete()
            .eq("id", pendingDeleteId)
            .eq("seller_id", currentUser.id);

        if (error) throw error;

        pendingDeleteId = null;
        get("deleteConfirmModal").classList.add("hidden");

        await loadProducts();
        await loadMyListings();

        if (currentProfile?.role === "admin") {
            await loadAdminDashboard();
        }

    } catch (error) {
        alert("Unable to delete product: " + error.message);

    } finally {
        button.disabled = false;
    }
});


// =====================================
// 22. ADMIN DASHBOARD
// =====================================

async function loadAdminDashboard() {
    const message = get("adminMessage");
    const productGrid = get("adminProductGrid");

    if (!message || !productGrid) return;

    if (!currentUser || currentProfile?.role !== "admin") {
        message.textContent = "Access denied. Admin only.";
        productGrid.innerHTML = "";
        return;
    }

    message.textContent = "Loading dashboard...";

    try {
        const { data: users, error: userError } = await db
            .from("profiles")
            .select("*");

        if (userError) throw userError;

        const { data: allProducts, error: productError } = await db
            .from("products")
            .select("*")
            .order("created_at", { ascending: false });

        if (productError) throw productError;

        const safeProducts = allProducts || [];

        if (get("totalUsers")) {
            get("totalUsers").textContent = (users || []).length;
        }

        if (get("totalProducts")) {
            get("totalProducts").textContent = safeProducts.length;
        }

        if (get("activeProducts")) {
            get("activeProducts").textContent =
                safeProducts.filter(p => p.status === "active").length;
        }

        if (get("hiddenProducts")) {
            get("hiddenProducts").textContent =
                safeProducts.filter(p => p.status === "hidden").length;
        }

        adminUsers = users || [];
        filterUsers();

        const sellerIds = [
            ...new Set(safeProducts.map(p => p.seller_id).filter(Boolean))
        ];

        let sellers = [];

        if (sellerIds.length) {
            const { data, error } = await db
                .from("profiles")
                .select("*")
                .in("id", sellerIds);

            if (error) throw error;
            sellers = data || [];
        }

        productGrid.innerHTML = "";

        if (!safeProducts.length) {
            productGrid.innerHTML =
                "<p>No products have been posted yet.</p>";
        }

        safeProducts.forEach(product => {
            const seller = sellers.find(
                s => s.id === product.seller_id
            );

            const sellerName = seller
                ? seller.full_name || seller.name || "Student"
                : "Unknown Seller";

            const isHidden = product.status === "hidden";

            const card = document.createElement("div");
            card.className = "product-card";

            const image = document.createElement("img");
            image.src = product.image_url ||
                "https://placehold.co/400x300?text=No+Image";

            image.alt = "Product Image";
            card.appendChild(image);

            const info = document.createElement("div");
            info.className = "product-info";

            info.innerHTML = `
                <h3>${escapeHTML(product.title)}</h3>
                <p class="price">${formatPrice(product.price)}</p>
                <p>Category: ${escapeHTML(product.category || "")}</p>
                <p>Seller: ${escapeHTML(sellerName)}</p>
                <p>Status: <strong>${isHidden ? "Hidden" : "Active"}</strong></p>

                <button class="btn-primary"
                    onclick="toggleProductStatus('${product.id}', '${isHidden ? "active" : "hidden"}')">
                    ${isHidden ? "Unhide Listing" : "Hide Listing"}
                </button>

                <button class="btn-primary"
                    onclick="adminDeleteProduct('${product.id}')">
                    Delete Listing
                </button>
            `;

            card.appendChild(info);
            productGrid.appendChild(card);
        });

        message.textContent = "Dashboard loaded successfully.";

    } catch (error) {
        console.error("Admin Dashboard Error:", error);
        message.textContent =
            "Error loading dashboard: " + error.message;
    }
}


// =====================================
// 23. ADMIN USER SEARCH AND FILTER
// =====================================

function filterUsers() {
    const searchInput = get("userSearch");
    const roleFilter = get("roleFilter");

    if (!searchInput || !roleFilter) return;

    const searchValue = searchInput.value.toLowerCase();
    const selectedRole = roleFilter.value.toLowerCase();

    const filteredUsers = adminUsers.filter(user => {
        const name = (
            user.full_name || user.name || "Student"
        ).toLowerCase();

        const role = (user.role || "student").toLowerCase();

        const studentId = (user.student_id || "").toLowerCase();
        const course = (user.course || "").toLowerCase();

        const matchesSearch =
            name.includes(searchValue) ||
            studentId.includes(searchValue) ||
            course.includes(searchValue);

        return matchesSearch &&
            (selectedRole === "all" || role === selectedRole);
    });

    displayAdminUsers(filteredUsers);
}


function displayAdminUsers(users) {
    const userTable = get("userTable");
    if (!userTable) return;

    userTable.innerHTML = "";

    if (!users.length) {
        userTable.innerHTML = `
            <tr><td colspan="6">No matching accounts found.</td></tr>
        `;
        return;
    }

    users.forEach(user => {
        const row = document.createElement("tr");

        const values = [
            user.full_name || user.name || "Student",
            user.student_id || "-",
            user.course || "-",
            user.year_level || "-",
            user.role || "student",
            user.created_at
                ? new Date(user.created_at).toLocaleDateString("en-PH")
                : "-"
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        userTable.appendChild(row);
    });
}


// =====================================
// 24. ADMIN HIDE / UNHIDE PRODUCT
// =====================================

function toggleProductStatus(productId, newStatus) {
    if (currentProfile?.role !== "admin") {
        alert("Admin access required.");
        return;
    }

    pendingStatusProductId = productId;
    pendingProductStatus = newStatus;

    const action = newStatus === "hidden" ? "Hide" : "Unhide";

    get("adminStatusTitle").textContent = action + " Listing?";

    get("adminStatusText").textContent =
        `Are you sure you want to ${action.toLowerCase()} this listing?`;

    get("confirmAdminStatus").textContent = "Yes, " + action;

    get("adminStatusModal").classList.remove("hidden");
}


on("cancelAdminStatus", "click", function() {
    pendingStatusProductId = null;
    pendingProductStatus = null;

    get("adminStatusModal").classList.add("hidden");
});


on("confirmAdminStatus", "click", async function() {
    if (!pendingStatusProductId || !pendingProductStatus) return;
    if (!(await verifyAuthenticatedUser())) return;

    const button = get("confirmAdminStatus");
    button.disabled = true;

    try {
        const { error } = await db
            .from("products")
            .update({ status: pendingProductStatus })
            .eq("id", pendingStatusProductId);

        if (error) throw error;

        pendingStatusProductId = null;
        pendingProductStatus = null;

        get("adminStatusModal").classList.add("hidden");

        await loadAdminDashboard();
        await loadProducts();

    } catch (error) {
        alert("Unable to update product: " + error.message);

    } finally {
        button.disabled = false;
    }
});


// =====================================
// 25. ADMIN DELETE PRODUCT
// =====================================

function adminDeleteProduct(productId) {
    if (currentProfile?.role !== "admin") {
        alert("Admin access required.");
        return;
    }

    pendingDeleteId = productId;
    get("adminDeleteModal").classList.remove("hidden");
}


on("cancelAdminDelete", "click", function() {
    pendingDeleteId = null;
    get("adminDeleteModal").classList.add("hidden");
});


on("confirmAdminDelete", "click", async function() {
    if (!pendingDeleteId) return;
    if (!(await verifyAuthenticatedUser())) return;

    const button = get("confirmAdminDelete");
    button.disabled = true;

    try {
        const { error } = await db
            .from("products")
            .delete()
            .eq("id", pendingDeleteId);

        if (error) throw error;

        pendingDeleteId = null;
        get("adminDeleteModal").classList.add("hidden");

        await loadAdminDashboard();
        await loadProducts();

    } catch (error) {
        alert("Unable to delete product: " + error.message);

    } finally {
        button.disabled = false;
    }
});


// =====================================
// 26. ADMIN SEARCH LISTENERS
// =====================================

on("userSearch", "input", filterUsers);
on("roleFilter", "change", filterUsers);


// =====================================
// 27. CART POPUP
// =====================================

function closeCartPopup() {
    if (get("cartAddedModal")) {
        get("cartAddedModal").classList.add("hidden");
    }
}

function goToCart() {
    closeCartPopup();
    if (!currentUser) {
        showPage("auth");
        return;
    }
    loadCart();
    renderCart();
    showPage("cart");
}


// =====================================
// 28. MAKE FUNCTIONS ACCESSIBLE TO HTML
// =====================================

window.showPage = showPage;
window.handleAccount = handleAccount;
window.setAuthMode = setAuthMode;

window.editProduct = editProduct;
window.deleteProduct = deleteProduct;

window.toggleProductStatus = toggleProductStatus;
window.adminDeleteProduct = adminDeleteProduct;

window.openProductDetails = openProductDetails;
window.openBuyNow = openBuyNow;
window.openCartCheckout = openCartCheckout;
window.openExploreCategory = openExploreCategory;
window.openExploreSorted = openExploreSorted;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeProfileDropdown = closeProfileDropdown;
window.setMyListingsView = setMyListingsView;

window.addToCart = addToCart;
window.changeCartQuantity = changeCartQuantity;
window.changeCheckoutQuantity = changeCheckoutQuantity;
window.removeFromCart = removeFromCart;

window.updateOrderStatus = updateOrderStatus;

window.closeCartPopup = closeCartPopup;
window.goToCart = goToCart;


// =====================================
// 29. AUTH LISTENERS, BACK-BUTTON GUARD & STARTUP
// =====================================

if (db && db.auth?.onAuthStateChange) {
    db.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
            isRecoveryMode = true;
            authInitialized = true;
            setAuthGateState(true);
            openResetPasswordForm();
            return;
        }

        if (event === "SIGNED_OUT" || !session) {
            if (isHandlingAuthSubmit) return;

            const wasManual = isManualLogout;
            isManualLogout = false;
            currentUser = null;
            currentProfile = null;

            clearProtectedStateAndDOM();
            authInitialized = true;
            setAuthGateState(true);
            updateAccount();
            updateSellPage();
            setAuthMode("login");

            history.replaceState({ page: "auth", locked: true }, "", "#login");
            history.pushState({ page: "auth", locked: true }, "", "#login");
            showPage("auth", { skipHistory: true });

            if (!wasManual) {
                showMessage(
                    "authMessage",
                    "Your session has ended. Please log in to continue.",
                    "error"
                );
            }
            return;
        }

        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && !isHandlingAuthSubmit && !isRecoveryMode && authInitialized) {
            if (!currentUser || currentUser.id !== session.user.id) {
                await loadSession({ navigate: true });
            }
        }
    });
}

window.addEventListener("popstate", function(event) {
    if (!authInitialized) return;

    if (!currentUser) {
        history.pushState({ page: "auth", locked: true }, "", "#login");
        setAuthGateState(true);
        showPage("auth", { skipHistory: true });
        return;
    }

    const requested = event.state?.page && PROTECTED_PAGES.has(event.state.page)
        ? event.state.page
        : getRequestedPageFromURL();

    showPage(requested, { skipHistory: true });
});

window.addEventListener("hashchange", function() {
    if (!authInitialized) return;

    if (!currentUser) {
        history.replaceState({ page: "auth", locked: true }, "", "#login");
        setAuthGateState(true);
        showPage("auth", { skipHistory: true });
        return;
    }

    const requested = getRequestedPageFromURL();
    showPage(requested, { skipHistory: true });
});

window.addEventListener("pageshow", async function(event) {
    if (!event.persisted || !db) return;

    const { data } = await db.auth.getSession();
    if (!data?.session?.user) {
        await handleSessionInvalidated("Please log in to access UniTrade.");
        return;
    }

    await verifyAuthenticatedUser();
});

document.addEventListener("visibilitychange", async function() {
    if (document.visibilityState !== "visible" || !authInitialized || !db || !currentUser) {
        return;
    }

    const { data } = await db.auth.getSession();
    if (!data?.session?.user) {
        await handleSessionInvalidated("Your session has expired. Please log in again.");
    }
});

// Start authentication check immediately; marketplace content remains locked until verified.
loadSession();


// =====================================
// UNITRADE REAL-TIME ORDER CHAT
// =====================================

let activeChatOrderId = null;
let activeChatChannel = null;
let activeMeetupChannel = null;

async function openOrderChat(orderId) {
    if (!currentUser || !db) {
        alert("Please login first.");
        return;
    }

    try {
        if (activeChatChannel) {
            await db.removeChannel(activeChatChannel);
            activeChatChannel = null;
        }

        // 1. Get selected order
        const { 
// OPEN CHAT


data: order, error } = await db
            .from("orders")
            .select("id, buyer_id, seller_id, product_title, chat_group_id")
            .eq("id", orderId)
            .single();

        if (error) throw error;

        // 2. Check access
        if (
            order.buyer_id !== currentUser.id &&
            order.seller_id !== currentUser.id
        ) {
            throw new Error("You are not allowed to access this chat.");
        }

        // 3. Get the other user's ID
        const otherUserId = order.buyer_id === currentUser.id
            ? order.seller_id
            : order.buyer_id;

        // 4. Get other user's profile
        const { data: otherUser, error: profileError } = await db
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", otherUserId)
            .maybeSingle();

        if (profileError) throw profileError;

        // 5. Display other user's information
        get("chatUserName").textContent =
            otherUser?.full_name || "UniTrade User";

        get("chatUserRole").textContent =
            otherUser?.role
                ? otherUser.role.charAt(0).toUpperCase() +
                  otherUser.role.slice(1)
                : "UniTrade User";

        // 6. Find other orders in the same checkout group
        let chatOrders = [order];

        if (order.chat_group_id) {
            const { data: groupedOrders, error: groupError } = await db
                .from("orders")
                .select("id, product_title, created_at")
                .eq("chat_group_id", order.chat_group_id)
                .eq("buyer_id", order.buyer_id)
                .eq("seller_id", order.seller_id)
                .order("created_at", { ascending: true });

            if (groupError) throw groupError;

            if (groupedOrders && groupedOrders.length > 0) {
                chatOrders = groupedOrders;
            }
        }

        // 7. Use common order ID
        const chatOrderId = chatOrders[0].id;

        activeChatOrderId = chatOrderId;

        // 8. Display grouped products
        const productNames = [
            ...new Set(chatOrders.map(item => item.product_title))
        ];

        get("chatTitle").textContent =
            productNames.join(", ");

        // 9. Open chat modal
get("chatModal").classList.remove("hidden");

// Load meetup location
console.log("Opening meetup location...");

await loadMeetupLocation();

console.log("Meetup location function finished.");

get("chatMessages").innerHTML =
    "<p>Loading messages...</p>";

        // 10. Load messages
        await loadChatMessages();

        // 11. Subscribe to new messages
        activeChatChannel = db
            .channel("order-chat-" + chatOrderId)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "chat_messages",
                    filter: "order_id=eq." + chatOrderId
                },
                payload => {
                    appendChatMessage(payload.new);
                }
            )
            .subscribe();

    } catch (error) {
        console.error("Open Chat Error:", error);
        alert("Unable to open chat: " + error.message);
    }
}


async function loadChatMessages() {
    const container = get("chatMessages");

    if (!container || !currentUser || !activeChatOrderId) {
        return;
    }

    try {
        // Load existing messages
        const { data, error } = await db
            .from("chat_messages")
            .select("id, sender_id, message, created_at")
            .eq("order_id", activeChatOrderId)
            .order("created_at", { ascending: true });

        if (error) throw error;

        // Mark received messages as read
        const { error: readError } = await db
            .from("chat_messages")
            .update({
                read_at: new Date().toISOString()
            })
            .eq("order_id", activeChatOrderId)
            .neq("sender_id", currentUser.id)
            .is("read_at", null);

        if (readError) throw readError;

        // Display messages
        container.innerHTML = "";

        if (!data || data.length === 0) {
            container.innerHTML =
                "<p>No messages yet. Start the conversation!</p>";
            return;
        }

        data.forEach(message => appendChatMessage(message));

    } catch (error) {
        console.error("Load Chat Messages Error:", error);
        container.innerHTML = "<p>Unable to load messages.</p>";
    }
}

// DISPLAY ONE MESSAGE
function appendChatMessage(message) {
    const container = get("chatMessages");

    if (!container || !message) return;

    // Avoid duplicate messages.
    if (
        container.querySelector(
            `[data-message-id="${message.id}"]`
        )
    ) {
        return;
    }

    const emptyMessage = container.querySelector("p");

    if (emptyMessage) {
        emptyMessage.remove();
    }

    const isMine = message.sender_id === currentUser.id;

    const bubble = document.createElement("div");

    bubble.className = "chat-bubble" +
        (isMine ? " my-message" : "");

    bubble.dataset.messageId = message.id;

    const content = document.createElement("div");
    content.textContent = message.message;

    const time = document.createElement("small");
    time.textContent = message.created_at
        ? new Date(message.created_at).toLocaleString("en-PH")
        : "";

    bubble.appendChild(content);
    bubble.appendChild(time);

    container.appendChild(bubble);

    container.scrollTop = container.scrollHeight;
}


// SEND MESSAGE
async function sendChatMessage() {
    if (!currentUser || !activeChatOrderId) return;
    if (!(await verifyAuthenticatedUser())) return;

    const input = get("chatInput");
    const button = get("sendChatButton");

    const message = input.value.trim();

    if (!message) return;

    if (message.length > 2000) {
        showMessage(
            "chatMessageStatus",
            "Message is too long.",
            "error"
        );
        return;
    }

    button.disabled = true;

    try {
        const { error } = await db
            .from("chat_messages")
            .insert({
                order_id: activeChatOrderId,
                sender_id: currentUser.id,
                message: message
            });

        if (error) throw error;

        input.value = "";

        showMessage("chatMessageStatus", "");

    } catch (error) {
        console.error("Send Message Error:", error);

        showMessage(
            "chatMessageStatus",
            "Unable to send message: " + error.message,
            "error"
        );

    } finally {
        button.disabled = false;
    }
}


// CLOSE CHAT
async function closeOrderChat() {

    if (activeChatChannel && db) {
        await db.removeChannel(activeChatChannel);
        activeChatChannel = null;
    }

    if (activeMeetupChannel && db) {
        await db.removeChannel(activeMeetupChannel);
        activeMeetupChannel = null;
    }

    activeChatOrderId = null;

    get("chatModal").classList.add("hidden");
    get("chatMessages").innerHTML = "";
    get("chatInput").value = "";
    get("chatMessageStatus").textContent = "";
}

// =====================================
// MEETUP LOCATION FUNCTIONS
// =====================================

async function loadMeetupLocation() {

    if (!activeChatOrderId || !currentUser || !db) return;

    const locationText = document.getElementById("chatMeetupLocation");
    const locationInput = document.getElementById("meetupLocationInput");
    const sellerEditor = document.getElementById("sellerMeetupEditor");
    const statusMessage = document.getElementById("meetupLocationStatus");

    if (!locationText || !sellerEditor || !statusMessage) return;

    const { data: order, error } = await db
        .from("orders")
        .select("id, seller_id, meetup_location")
        .eq("id", activeChatOrderId)
        .single();

    if (error || !order) {
        statusMessage.textContent = "Unable to load meetup location.";
        console.error("Load Meetup Error:", error);
        return;
    }

    const isSeller = order.seller_id === currentUser.id;

    sellerEditor.classList.toggle("hidden", !isSeller);

    if (locationInput) {
        locationInput.value = order.meetup_location || "";
    }

    locationText.textContent =
        order.meetup_location || "To be discussed";

    statusMessage.textContent = order.meetup_location
        ? "Meet-up location confirmed."
        : "Waiting for the seller to confirm the location.";

    if (activeMeetupChannel) {
        await db.removeChannel(activeMeetupChannel);
        activeMeetupChannel = null;
    }

    activeMeetupChannel = db
        .channel("meetup-location-" + order.id)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "orders",
                filter: "id=eq." + order.id
            },
            (payload) => {

                const updatedLocation =
                    payload.new.meetup_location || "To be discussed";

                locationText.textContent = updatedLocation;

                if (locationInput && isSeller) {
                    locationInput.value =
                        payload.new.meetup_location || "";
                }

                statusMessage.textContent =
                    payload.new.meetup_location
                        ? "Meet-up location confirmed."
                        : "Waiting for the seller to confirm the location.";
            }
        )
.subscribe((status) => {
    console.log("Meetup Realtime Status:", status);
});
}

// =====================================
// SAVE / CONFIRM MEETUP LOCATION
// =====================================

async function saveMeetupLocation() {
    if (!currentUser || !activeChatOrderId) {
        alert("Please open an order chat first.");
        return;
    }
    if (!(await verifyAuthenticatedUser())) return;

    const locationInput =
        document.getElementById("meetupLocationInput");

    const statusMessage =
        document.getElementById("meetupLocationStatus");

    const saveButton =
        document.getElementById("saveMeetupButton");

    const location = locationInput.value.trim();

    if (!location) {
        statusMessage.textContent =
            "Please enter the agreed meet-up location.";
        return;
    }

    if (location.length < 5) {
        statusMessage.textContent =
            "Please enter a more complete location.";
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {

        // Check the selected order and verify the seller.
        const { data: order, error: orderError } = await db
            .from("orders")
            .select("id, seller_id, chat_group_id")
            .eq("id", activeChatOrderId)
            .single();

        if (orderError || !order) {
            throw new Error("Unable to find this order.");
        }

        if (order.seller_id !== currentUser.id) {
            throw new Error(
                "Only the seller can confirm the meetup location."
            );
        }

        // Update all orders in the same seller chat group.
        let updateQuery = db
            .from("orders")
            .update({
                meetup_location: location
            })
            .eq("seller_id", currentUser.id);

        if (order.chat_group_id) {
            updateQuery = updateQuery.eq(
                "chat_group_id",
                order.chat_group_id
            );
        } else {
            updateQuery = updateQuery.eq("id", order.id);
        }

        const { data, error } = await updateQuery
            .select("id, meetup_location");

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            throw new Error(
                "The location was not saved. Please check your database permissions."
            );
        }

        document.getElementById("chatMeetupLocation").textContent =
            location;

        statusMessage.textContent =
            "Meet-up location successfully confirmed!";

        saveButton.textContent = "Location Confirmed";

    } catch (error) {

        console.error("Meetup location error:", error);

        statusMessage.textContent =
            error.message || "Unable to save meetup location.";

    } finally {

        saveButton.disabled = false;

        if (saveButton.textContent === "Saving...") {
            saveButton.textContent = "Confirm Meetup Location";
        }
    }
}
// =====================================
// UNREAD MESSAGE COUNTER
// =====================================

async function getUnreadMessageCount(orderId) {
    if (!currentUser || !db) return 0;

    const { count, error } = await db
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .neq("sender_id", currentUser.id)
        .is("read_at", null);

    if (error) {
        console.error("Unread Count Error:", error);
        return 0;
    }

    return count || 0;
}

// FIX: CANCEL BUTTON SA BUY NOW AT CART CHECKOUT
const cancelBuyButton = document.getElementById("cancelBuy");

if (cancelBuyButton) {
    cancelBuyButton.addEventListener("click", function () {
        const buyNowModal = document.getElementById("buyNowModal");

        if (buyNowModal) {
            buyNowModal.classList.add("hidden");
        }

        // I-reset lang ang temporary checkout data
        checkoutItems = [];
        checkoutMode = false;
        selectedProduct = null;

        const message = document.getElementById("buyOrderMessage");
        if (message) message.textContent = "";

        const confirmButton = document.getElementById("confirmBuy");
        if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.textContent = "Submit Order";
        }

        // Hindi buburahin ang laman ng Cart.
    });
}