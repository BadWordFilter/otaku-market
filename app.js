import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  where,
  deleteDoc
} from "./firebase-config.js";

// ===== 전역 변수 =====
let products = [];
let currentProducts = [];
let favorites = new Set();
let currentUser = null;

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  // 테마 초기화
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  initializeAuth();
  loadProducts();
  loadUserStats(); // 유저 통계 (가입자 수 등)
  setupEventListeners();
  updateThemeIcon();

  console.log('🚀 오타쿠 마켓 초기화 완료');
});

// ===== 인증 (Authentication) =====
function initializeAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = {
        uid: user.uid,
        email: user.email,
        nickname: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL
      };
      console.log('✅ 로그인됨:', currentUser.nickname);
    } else {
      currentUser = null;
      console.log('❌ 로그아웃됨');
    }
    updateHeaderForUser();
  });
}

function updateHeaderForUser() {
  const headerActions = document.querySelector('.header-actions');
  const themeBtn = `<button class="theme-toggle" onclick="toggleTheme()" id="themeToggle" aria-label="테마 변경">🌙</button>`;

  if (currentUser) {
    const avatarText = currentUser.photoURL
      ? `<img src="${currentUser.photoURL}" alt="프로필" style="width: 100%; height: 100%; border-radius: 50%;">`
      : currentUser.nickname.charAt(0);

    headerActions.innerHTML = `
      ${themeBtn}
      <button class="btn btn-primary" onclick="showSellModal()">판매하기</button>
      <div class="user-profile" onclick="toggleDropdown()">
        <div class="user-avatar">${avatarText}</div>
        <div class="user-info">
          <div class="user-nickname">${currentUser.nickname}</div>
          <div class="user-level">일반 회원</div>
        </div>
        <div class="dropdown-menu" id="userDropdown">
          <div class="dropdown-item" onclick="event.stopPropagation(); viewMyProfile()">
            <span>👤</span> 내 프로필
          </div>
          <div class="dropdown-item" onclick="event.stopPropagation(); viewMyListings()">
            <span>📦</span> 내 판매 상품
          </div>
          <div class="dropdown-item" onclick="event.stopPropagation(); viewFavorites()">
            <span>❤️</span> 찜한 상품
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" onclick="event.stopPropagation(); window.handleLogout()">
            <span>🚪</span> 로그아웃
          </div>
        </div>
      </div>
    `;
  } else {
    headerActions.innerHTML = `
      ${themeBtn}
      <button class="btn btn-secondary" onclick="showLoginModal()">로그인</button>
      <button class="btn btn-primary" onclick="showSellModal()">판매하기</button>
    `;
  }
  updateThemeIcon();
}

async function handleSignup(event) {
  event.preventDefault();
  const nickname = document.getElementById('signupNickname').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
  const region = document.getElementById('signupRegion').value;

  if (password !== passwordConfirm) {
    showNotification('회원가입 실패', '비밀번호가 일치하지 않습니다.', 'error');
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await addDoc(collection(db, 'users'), {
      uid: user.uid,
      nickname: nickname,
      email: email,
      region: region,
      joinDate: new Date(),
      salesCount: 0
    });
    closeModal('signupModal');
    document.getElementById('signupForm').reset();
    showNotification('회원가입 성공!', `${nickname}님 환영합니다!`);
  } catch (error) {
    console.error('회원가입 오류:', error);
    showNotification('회원가입 실패', '이미 사용 중인 이메일이거나 비밀번호가 너무 약합니다.', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    closeModal('loginModal');
    showNotification('로그인 성공!', `환영합니다!`);
  } catch (error) {
    console.error('로그인 오류:', error);
    showNotification('로그인 실패', '이메일 또는 비밀번호가 잘못되었습니다.', 'error');
  }
}

async function handleSocialLogin(provider) {
  if (provider !== 'google') {
    showNotification('알림', '구글 로그인만 지원합니다.', 'info');
    return;
  }

  const googleProvider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // 사용자 정보 저장 확인
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('uid', '==', user.uid));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      await addDoc(collection(db, 'users'), {
        uid: user.uid,
        nickname: user.displayName || user.email.split('@')[0],
        email: user.email,
        region: 'seoul',
        joinDate: new Date(),
        salesCount: 0
      });
      showNotification('회원가입 완료', `${user.displayName}님 환영합니다!`);
    } else {
      showNotification('로그인 성공', `환영합니다!`);
    }
    closeModal('loginModal');
  } catch (error) {
    console.error('소셜 로그인 오류:', error);
    showNotification('로그인 실패', '구글 로그인 중 오류가 발생했습니다.', 'error');
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    closeDropdown();
    showNotification('로그아웃', '로그아웃되었습니다.');
  } catch (error) {
    console.error('로그아웃 오류:', error);
  }
}

// ===== 상품 관리 (Product Management) =====

async function loadProducts() {
  const productsRef = collection(db, 'products');
  const q = query(productsRef, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snapshot) => {
    products = [];
    snapshot.forEach((doc) => {
      products.push({ id: doc.id, ...doc.data() });
    });

    currentProducts = [...products];
    renderProducts(currentProducts);

    // 통계 업데이트
    animateValue("statProducts", 0, products.length, 1000);
    animateValue("statTrades", 0, 0, 1000); // 거래 기능 미구현으로 0
  });
}

async function handleSellProduct(event) {
  event.preventDefault();
  if (!currentUser) {
    closeModal('sellModal');
    showNotification('로그인 필요', '로그인이 필요합니다.', 'error');
    showLoginModal();
    return;
  }

  const title = document.getElementById('sellTitle').value;
  const category = document.getElementById('sellCategory').value;
  const price = parseInt(document.getElementById('sellPrice').value);
  const condition = document.getElementById('sellCondition').value;
  const description = document.getElementById('sellDescription').value;
  const region = document.getElementById('sellRegion').value;

  const categoryNames = { game: '게임', figure: '피규어', anime: '애니 굿즈', manga: '만화책', card: '카드/TCG', plush: '인형/플러시', merch: '기타 굿즈' };
  const conditionNames = { 'new': '미개봉 새상품', 'like-new': '거의 새것', 'good': '양호', 'fair': '사용감 있음' };
  const regionNames = { seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산', daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북', jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주' };

  try {
    await addDoc(collection(db, 'products'), {
      title, category, categoryName: categoryNames[category],
      price, condition, conditionName: conditionNames[condition],
      location: regionNames[region] || '서울', region: region || 'seoul',
      image: 'placeholder.jpg',
      seller: currentUser.nickname, sellerEmail: currentUser.email, sellerUID: currentUser.uid,
      description, badge: 'new', views: 0, likes: 0, createdAt: new Date()
    });
    closeModal('sellModal');
    document.getElementById('sellForm').reset();
    showNotification('등록 완료', '상품이 등록되었습니다.');
  } catch (error) {
    console.error('상품 등록 오류:', error);
    showNotification('등록 실패', '오류가 발생했습니다.', 'error');
  }
}

async function handleDeleteProduct(productId) {
  if (!confirm('정말로 삭제하시겠습니까?')) return;
  try {
    await deleteDoc(doc(db, 'products', productId));
    closeModal('productModal');
    showNotification('삭제 완료', '상품이 삭제되었습니다.');
  } catch (error) {
    console.error('삭제 오류:', error);
    showNotification('삭제 실패', '오류가 발생했습니다.', 'error');
  }
}

// 수정 모달 열기
function showEditModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  document.getElementById('editProductId').value = product.id;
  document.getElementById('editTitle').value = product.title;
  document.getElementById('editCategory').value = product.category;
  document.getElementById('editPrice').value = product.price;
  document.getElementById('editCondition').value = product.condition;
  document.getElementById('editDescription').value = product.description;
  document.getElementById('editRegion').value = product.region || 'seoul';

  closeModal('productModal');
  document.getElementById('editModal').classList.add('active');
}

// 상품 수정 처리
async function handleEditProduct(event) {
  event.preventDefault();

  const productId = document.getElementById('editProductId').value;
  const title = document.getElementById('editTitle').value;
  const category = document.getElementById('editCategory').value;
  const price = parseInt(document.getElementById('editPrice').value);
  const condition = document.getElementById('editCondition').value;
  const description = document.getElementById('editDescription').value;
  const region = document.getElementById('editRegion').value;

  const categoryNames = { game: '게임', figure: '피규어', anime: '애니 굿즈', manga: '만화책', card: '카드/TCG', plush: '인형/플러시', merch: '기타 굿즈' };
  const conditionNames = { 'new': '미개봉 새상품', 'like-new': '거의 새것', 'good': '양호', 'fair': '사용감 있음' };
  const regionNames = { seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산', daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북', jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주' };

  try {
    await updateDoc(doc(db, 'products', productId), {
      title, category, categoryName: categoryNames[category],
      price, condition, conditionName: conditionNames[condition],
      location: regionNames[region] || '서울', region: region || 'seoul',
      description, updatedAt: new Date()
    });
    closeModal('editModal');
    showNotification('수정 완료', '상품이 수정되었습니다.');
  } catch (error) {
    console.error('수정 오류:', error);
    showNotification('수정 실패', '오류가 발생했습니다.', 'error');
  }
}

// ===== UI & Utility Functions =====

function showLoginModal() {
  document.getElementById('loginModal').classList.add('active');
}
function showSellModal() {
  if (!currentUser) {
    showNotification('로그인 필요', '판매하려면 로그인이 필요합니다.', 'error');
    showLoginModal();
    return;
  }
  document.getElementById('sellModal').classList.add('active');
}
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}
function switchToSignup() {
  closeModal('loginModal');
  document.getElementById('signupModal').classList.add('active');
}
function switchToLogin() {
  closeModal('signupModal');
  showLoginModal();
}
function toggleDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.toggle('show');
}
function closeDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
}

function showNotification(title, message, type = 'success') {
  const container = document.getElementById('notificationContainer');
  if (!container) return;
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</div>
    <div class="notification-content"><div class="notification-title">${title}</div><div class="notification-message">${message}</div></div>
  `;
  container.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.5s ease forwards';
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

// 테마 (Theme)
function toggleTheme() {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
}
function updateThemeIcon() {
  const toggleBtns = document.querySelectorAll('.theme-toggle');
  const currentTheme = localStorage.getItem('theme') || 'dark';
  toggleBtns.forEach(btn => {
    btn.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
  });
}

// 기타 유틸리티
function formatPrice(price) { return price.toLocaleString('ko-KR'); }
function getCategoryEmoji(category) {
  const emojis = { game: '🎮', figure: '🗿', anime: '📺', manga: '📚', card: '🃏', plush: '🧸', merch: '✨' };
  return emojis[category] || '🎯';
}
function getColorForCategory(category) {
  const colors = { game: '8B5CF6', figure: '3B82F6', anime: 'EC4899', manga: '10B981', card: 'F59E0B', plush: 'EF4444', merch: '6366F1' };
  return colors[category] || '8B5CF6';
}

function loadUserStats() {
  onSnapshot(collection(db, 'users'), (snapshot) => {
    animateValue("statUsers", 0, snapshot.size, 1000);
  });
}

function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  if (end === 0) { obj.innerHTML = "0"; return; }
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

// 렌더링
function renderProducts(productsToRender) {
  const grid = document.getElementById('productGrid');
  if (!productsToRender || productsToRender.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">😢</div>
        <div style="font-size: 18px; font-weight: 600;">상품이 없습니다</div>
      </div>`;
    return;
  }
  grid.innerHTML = productsToRender.map(product => `
    <div class="product-card" onclick="showProductDetail('${product.id}')">
      <div class="product-image">
        <img src="${product.image}" alt="${product.title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect width=%22400%22 height=%22400%22 fill=%22%23${getColorForCategory(product.category)}%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2248%22 fill=%22white%22%3E${getCategoryEmoji(product.category)}%3C/text%3E%3C/svg%3E'">
        ${product.badge ? `<div class="product-badge badge-${product.badge}">${product.badge === 'new' ? 'NEW' : 'HOT'}</div>` : ''}
        <div class="product-favorite ${favorites.has(product.id) ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${product.id}')">
          ${favorites.has(product.id) ? '❤️' : '🤍'}
        </div>
      </div>
      <div class="product-info">
        <div class="product-category">${product.categoryName}</div>
        <div class="product-title">${product.title}</div>
        <div class="product-condition">${product.conditionName}</div>
        <div class="product-price">${formatPrice(product.price)} <span>원</span></div>
        <div class="product-footer">
          <div class="product-location">📍 ${product.location || '서울'}</div>
          <div class="product-meta">👁️ ${product.views || 0} · ❤️ ${product.likes || 0}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function showProductDetail(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  document.getElementById('modalImage').src = product.image;
  document.getElementById('modalImage').onerror = function () {
    this.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23${getColorForCategory(product.category)}'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='120' fill='white'%3E${getCategoryEmoji(product.category)}%3C/text%3E%3C/svg%3E`;
  };
  document.getElementById('modalCategory').textContent = product.categoryName;
  document.getElementById('modalTitle').textContent = product.title;
  document.getElementById('modalPrice').textContent = formatPrice(product.price) + '원';
  document.getElementById('modalCondition').textContent = product.conditionName;
  document.getElementById('modalLocation').textContent = product.location || '서울';
  document.getElementById('modalDescription').textContent = product.description;
  document.getElementById('modalSeller').textContent = product.seller || '판매자';

  const modalActions = document.querySelector('#productModal .modal-actions');

  if (currentUser && (currentUser.uid === product.sellerUID || currentUser.email === product.sellerEmail)) {
    modalActions.innerHTML = `
      <div style="display: flex; gap: 8px; width: 100%;">
        <button class="btn btn-secondary btn-large" style="background-color: #ef4444; color: white; border: none; flex: 1;" onclick="handleDeleteProduct('${product.id}')">🗑️ 삭제</button>
        <button class="btn btn-primary btn-large" style="flex: 1;" onclick="showEditModal('${product.id}')">✏️ 수정</button>
        <button class="btn btn-secondary btn-large" style="flex: 1;" onclick="closeModal('productModal')">닫기</button>
      </div>
    `;
  } else {
    modalActions.innerHTML = `
      <div style="display: flex; gap: 8px; width: 100%;">
        <button class="btn btn-secondary btn-large" style="flex: 1;" onclick="showNotification('준비 중', '채팅 기능은 준비 중입니다.', 'info')">💬 채팅하기</button>
        <button class="btn btn-primary btn-large" style="flex: 1;" onclick="showNotification('준비 중', '결제 기능은 준비 중입니다.', 'info')">💰 구매하기</button>
      </div>
    `;
  }
  document.getElementById('productModal').classList.add('active');
}

function performSearch() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  if (!query) { currentProducts = [...products]; } else {
    currentProducts = products.filter(product =>
      product.title.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query) ||
      product.categoryName.includes(query)
    );
  }
  renderProducts(currentProducts);
}

function toggleFavorite(productId) {
  if (favorites.has(productId)) favorites.delete(productId);
  else favorites.add(productId);
  renderProducts(currentProducts);
}

function setupEventListeners() {
  window.onclick = function (event) {
    if (event.target.classList.contains('modal')) event.target.classList.remove('active');
    if (!event.target.matches('.user-profile') && !event.target.closest('.user-profile')) closeDropdown();
  };

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') performSearch();
    });
  }

  // 카테고리 클릭 이벤트 추가
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // 액티브 클래스 변경
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      const category = item.getAttribute('data-category');
      filterByCategory(category);
    });
  });
}

function filterByCategory(category) {
  const sectionTitle = document.querySelector('.section-title');

  if (category === 'all') {
    currentProducts = [...products];
    if (sectionTitle) sectionTitle.textContent = '전체 상품';
  } else {
    currentProducts = products.filter(p => p.category === category);
    if (sectionTitle) {
      const categoryName = document.querySelector(`.nav-item[data-category="${category}"]`).textContent;
      sectionTitle.textContent = `${categoryName} 상품`;
    }
  }
  renderProducts(currentProducts);
}

// 마이페이지 관련 기능
function viewMyProfile() {
  if (!currentUser) {
    showNotification('로그인 필요', '로그인이 필요합니다.', 'error');
    return;
  }

  document.getElementById('profileNickname').textContent = currentUser.nickname;
  document.getElementById('profileEmail').textContent = currentUser.email;

  const largeAvatar = document.getElementById('profileLargeAvatar');
  if (currentUser.photoURL) {
    largeAvatar.innerHTML = `<img src="${currentUser.photoURL}" alt="프로필" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
  } else {
    largeAvatar.textContent = currentUser.nickname.charAt(0);
  }

  document.getElementById('profileModal').classList.add('active');
  closeDropdown();
}

function viewMyListings() {
  if (!currentUser) {
    showNotification('로그인 필요', '로그인이 필요합니다.', 'error');
    return;
  }

  currentProducts = products.filter(p => p.sellerUID === currentUser.uid);
  renderProducts(currentProducts);
  closeDropdown();

  const sectionTitle = document.querySelector('.section-title');
  if (sectionTitle) sectionTitle.textContent = '내 판매 상품';

  if (currentProducts.length === 0) {
    showNotification('정보', '등록한 상품이 없습니다.', 'info');
  } else {
    showNotification('필터 적용', `${currentProducts.length}개의 상품을 찾았습니다.`);
  }
}

function viewFavorites() {
  if (favorites.size === 0) {
    showNotification('알림', '찜한 상품이 없습니다.', 'info');
    closeDropdown();
    return;
  }

  currentProducts = products.filter(p => favorites.has(p.id));
  renderProducts(currentProducts);
  closeDropdown();

  const sectionTitle = document.querySelector('.section-title');
  if (sectionTitle) sectionTitle.textContent = '찜한 상품 목록';
}

// ===== Window 객체에 함수 할당 (필수) =====
window.showLoginModal = showLoginModal;
window.showSellModal = showSellModal;
window.closeModal = closeModal;
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleSocialLogin = handleSocialLogin;
window.handleLogout = handleLogout;
window.handleSellProduct = handleSellProduct;
window.handleDeleteProduct = handleDeleteProduct;
window.showProductDetail = showProductDetail;
window.toggleFavorite = toggleFavorite;
window.performSearch = performSearch;
window.toggleDropdown = toggleDropdown;
window.closeDropdown = closeDropdown;
window.viewMyProfile = viewMyProfile;
window.viewMyListings = viewMyListings;
window.viewFavorites = viewFavorites;
window.toggleTheme = toggleTheme;
window.showEditModal = showEditModal;
window.handleEditProduct = handleEditProduct;

// CSS 추가
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-20px); } }
`;
document.head.appendChild(style);
