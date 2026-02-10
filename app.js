// Firebase 가져오기
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
  where
} from './firebase-config.js';

// Sample Product Data (초기 데이터 - Firebase에 한번만 업로드)
const sampleProducts = [
  {
    title: "젤다의 전설 티어스 오브 더 킹덤 한글판",
    category: "game",
    categoryName: "게임",
    price: 45000,
    condition: "like-new",
    conditionName: "거의 새것",
    location: "서울 강남구",
    region: "seoul",
    image: "zelda_totk.jpg",
    seller: "닌텐덕후",
    sellerEmail: "nintendo@example.com",
    description: "한 번만 플레이하고 케이스에 보관했습니다. 상태 매우 좋아요! 직거래 가능합니다.",
    badge: "hot",
    views: 342,
    likes: 28,
    createdAt: new Date()
  },
  {
    title: "원피스 조로 P.O.P 피규어 한정판",
    category: "figure",
    categoryName: "피규어",
    price: 180000,
    condition: "new",
    conditionName: "미개봉 새상품",
    location: "경기 성남시",
    region: "gyeonggi",
    image: "zoro_figure.jpg",
    seller: "피규어마니아",
    sellerEmail: "figure@example.com",
    description: "일본 직구로 받은 한정판 피규어입니다. 미개봉 새상품이며 박스 상태도 완벽합니다. 택배비 별도",
    badge: "new",
    views: 521,
    likes: 45,
    createdAt: new Date()
  }
];

// State
let products = [];
let currentProducts = [];
let favorites = new Set();
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeAuth();
  loadProducts();
  setupEventListeners();
});

// ===== Firebase Authentication =====

function initializeAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = {
        uid: user.uid,
        email: user.email,
        nickname: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL
      };
      console.log('✅ 로그인됨:', currentUser);
      updateHeaderForUser();
    } else {
      currentUser = null;
      console.log('❌ 로그아웃됨');
      updateHeaderForUser();
    }
  });
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

    // Firestore에 사용자 추가 정보 저장
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
    showNotification('회원가입 성공!', `${nickname}님, 오타쿠 마켓에 오신 것을 환영합니다!`);
  } catch (error) {
    console.error('회원가입 오류:', error);
    let message = '회원가입에 실패했습니다.';
    if (error.code === 'auth/email-already-in-use') {
      message = '이미 사용 중인 이메일입니다.';
    } else if (error.code === 'auth/weak-password') {
      message = '비밀번호는 최소 6자 이상이어야 합니다.';
    }
    showNotification('회원가입 실패', message, 'error');
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
  if (provider === 'google') {
    const googleProvider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Firestore에 사용자 정보 저장 (처음 로그인인 경우)
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
        showNotification('회원가입 완료!', `${user.displayName}님, 환영합니다!`);
      } else {
        showNotification('로그인 성공!', `환영합니다!`);
      }

      closeModal('loginModal');
    } catch (error) {
      console.error('Google 로그인 오류:', error);

      let message = 'Google 로그인에 실패했습니다.';
      if (error.code === 'auth/unauthorized-domain') {
        message = 'Firebase Console에서 도메인을 승인해주세요.\n이메일/비밀번호 로그인을 사용해주세요.';
      } else if (error.code === 'auth/popup-blocked') {
        message = '팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.';
      }

      showNotification('로그인 실패', message, 'error');
    }
  } else {
    showNotification('오류', '지원하지 않는 로그인 방식입니다.', 'error');
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

function updateHeaderForUser() {
  const headerActions = document.querySelector('.header-actions');

  if (currentUser) {
    const avatarText = currentUser.photoURL
      ? `<img src="${currentUser.photoURL}" alt="프로필" style="width: 100%; height: 100%; border-radius: 50%;">`
      : currentUser.nickname.charAt(0);

    headerActions.innerHTML = `
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
      <button class="btn btn-secondary" onclick="showLoginModal()">로그인</button>
      <button class="btn btn-primary" onclick="showSellModal()">판매하기</button>
    `;
  }
}

// ===== Firebase Firestore 제품 관리 =====

async function loadProducts() {
  const productsRef = collection(db, 'products');
  const q = query(productsRef, orderBy('createdAt', 'desc'));

  // 실시간 리스너
  onSnapshot(q, (snapshot) => {
    products = [];
    snapshot.forEach((doc) => {
      products.push({
        id: doc.id,
        ...doc.data()
      });
    });

    currentProducts = [...products];
    renderProducts(currentProducts);
    console.log('✅ 상품 로드됨:', products.length, '개');
  });
}

async function handleSellProduct(event) {
  event.preventDefault();

  if (!currentUser) {
    closeModal('sellModal');
    showNotification('로그인 필요', '상품을 등록하려면 로그인이 필요합니다.', 'error');
    setTimeout(() => showLoginModal(), 500);
    return;
  }

  const title = document.getElementById('sellTitle').value;
  const category = document.getElementById('sellCategory').value;
  const price = parseInt(document.getElementById('sellPrice').value);
  const condition = document.getElementById('sellCondition').value;
  const description = document.getElementById('sellDescription').value;

  const categoryNames = {
    game: '게임',
    figure: '피규어',
    anime: '애니 굿즈',
    manga: '만화책',
    card: '카드/TCG',
    plush: '인형/플러시',
    merch: '기타 굿즈'
  };

  const conditionNames = {
    'new': '미개봉 새상품',
    'like-new': '거의 새것',
    'good': '양호',
    'fair': '사용감 있음'
  };

  try {
    await addDoc(collection(db, 'products'), {
      title,
      category,
      categoryName: categoryNames[category],
      price,
      condition,
      conditionName: conditionNames[condition],
      location: '서울', // 나중에 사용자 정보에서 가져올 수 있음
      region: 'seoul',
      image: 'placeholder.jpg',
      seller: currentUser.nickname,
      sellerEmail: currentUser.email,
      sellerUID: currentUser.uid,
      description,
      badge: 'new',
      views: 0,
      likes: 0,
      createdAt: new Date()
    });

    closeModal('sellModal');
    document.getElementById('sellForm').reset();
    showNotification('상품 등록 완료!', '상품이 성공적으로 등록되었습니다.');
  } catch (error) {
    console.error('상품 등록 오류:', error);
    showNotification('등록 실패', '상품 등록에 실패했습니다.', 'error');
  }
}

// ===== 렌더링 및 UI 함수들 =====

function renderProducts(productsToRender) {
  const grid = document.getElementById('productGrid');

  if (!productsToRender || productsToRender.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">😢</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">상품이 없습니다</div>
        <div style="font-size: 14px;">첫 번째 상품을 등록해보세요!</div>
      </div>
    `;
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

  setTimeout(() => {
    document.querySelectorAll('.product-card').forEach((card, index) => {
      card.style.animation = `slideDown 0.4s ease ${index * 0.05}s backwards`;
    });
  }, 10);
}

function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const category = item.dataset.category;
      filterByCategory(category);
    });
  });

  // Filters
  document.getElementById('categoryFilter').addEventListener('change', applyFilters);
  document.getElementById('priceFilter').addEventListener('change', applyFilters);
  document.getElementById('conditionFilter').addEventListener('change', applyFilters);
  document.getElementById('regionFilter').addEventListener('change', applyFilters);

  // Sort
  document.getElementById('sortSelect').addEventListener('change', sortProducts);

  // Search
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Modal close on background click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeModal(e.target.id);
      }
    });
  });
}

function filterByCategory(category) {
  if (category === 'all') {
    currentProducts = [...products];
  } else {
    currentProducts = products.filter(p => p.category === category);
  }
  renderProducts(currentProducts);
}

function applyFilters() {
  const categoryFilter = document.getElementById('categoryFilter').value;
  const priceFilter = document.getElementById('priceFilter').value;
  const conditionFilter = document.getElementById('conditionFilter').value;
  const regionFilter = document.getElementById('regionFilter').value;

  currentProducts = products.filter(product => {
    if (categoryFilter !== 'all' && product.category !== categoryFilter) return false;

    if (priceFilter !== 'all') {
      const [min, max] = priceFilter.split('-').map(Number);
      if (product.price < min || product.price > max) return false;
    }

    if (conditionFilter !== 'all' && product.condition !== conditionFilter) return false;
    if (regionFilter !== 'all' && product.region !== regionFilter) return false;

    return true;
  });

  renderProducts(currentProducts);
}

function sortProducts() {
  const sortBy = document.getElementById('sortSelect').value;

  switch (sortBy) {
    case 'recent':
      currentProducts.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      break;
    case 'low-price':
      currentProducts.sort((a, b) => a.price - b.price);
      break;
    case 'high-price':
      currentProducts.sort((a, b) => b.price - a.price);
      break;
    case 'popular':
      currentProducts.sort((a, b) => (b.views || 0) - (a.views || 0));
      break;
  }

  renderProducts(currentProducts);
}

function performSearch() {
  const query = document.getElementById('searchInput').value.toLowerCase();

  if (!query) {
    currentProducts = [...products];
  } else {
    currentProducts = products.filter(product =>
      product.title.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query) ||
      product.categoryName.includes(query)
    );
  }

  renderProducts(currentProducts);
}

function toggleFavorite(productId) {
  if (favorites.has(productId)) {
    favorites.delete(productId);
  } else {
    favorites.add(productId);
  }
  renderProducts(currentProducts);
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

  const avatarText = product.seller?.charAt(0) || 'U';
  document.getElementById('sellerAvatar').textContent = avatarText;
  document.getElementById('sellerName').textContent = product.seller || '판매자';
  document.getElementById('sellerStats').textContent = `⭐ 5.0 · 판매 0건`;

  document.getElementById('productModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

// ===== Modal Functions =====

function showLoginModal() {
  document.getElementById('loginModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function showSellModal() {
  if (!currentUser) {
    showNotification('로그인 필요', '판매하려면 먼저 로그인해주세요.', 'error');
    setTimeout(() => showLoginModal(), 500);
    return;
  }

  document.getElementById('sellModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function switchToSignup() {
  closeModal('loginModal');
  setTimeout(() => {
    document.getElementById('signupModal').classList.add('active');
    document.body.style.overflow = 'hidden';
  }, 300);
}

function switchToLogin() {
  closeModal('signupModal');
  setTimeout(() => {
    document.getElementById('loginModal').classList.add('active');
    document.body.style.overflow = 'hidden';
  }, 300);
}

function closeModal(modalId) {
  if (modalId) {
    document.getElementById(modalId).classList.remove('active');
  } else {
    document.getElementById('productModal').classList.remove('active');
  }
  document.body.style.overflow = '';
}

function toggleDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (!dropdown) return;

  dropdown.classList.toggle('active');

  if (dropdown.classList.contains('active')) {
    setTimeout(() => {
      document.addEventListener('click', closeDropdownOnClickOutside);
    }, 10);
  }
}

function closeDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    dropdown.classList.remove('active');
  }
  document.removeEventListener('click', closeDropdownOnClickOutside);
}

function closeDropdownOnClickOutside(e) {
  const dropdown = document.getElementById('userDropdown');
  const profile = document.querySelector('.user-profile');

  if (dropdown && profile && !profile.contains(e.target)) {
    closeDropdown();
  }
}

function viewMyProfile() {
  if (!currentUser) return;
  showNotification('내 프로필', `닉네임: ${currentUser.nickname}\n이메일: ${currentUser.email}`);
}

function viewMyListings() {
  if (!currentUser) return;
  const myProducts = products.filter(p => p.sellerUID === currentUser.uid);
  currentProducts = myProducts;
  renderProducts(currentProducts);
  closeDropdown();
  showNotification('내 판매 상품', `총 ${myProducts.length}개의 상품이 등록되어 있습니다.`);
}

function viewFavorites() {
  const favoriteProducts = products.filter(p => favorites.has(p.id));
  currentProducts = favoriteProducts;
  renderProducts(currentProducts);
  closeDropdown();
  showNotification('찜한 상품', `총 ${favoriteProducts.length}개의 상품을 찜했습니다.`);
}

function showNotification(title, message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: var(--glass-bg);
    backdrop-filter: blur(20px);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 20px 24px;
    min-width: 300px;
    max-width: 400px;
    box-shadow: var(--shadow-lg);
    z-index: 10000;
    animation: slideDown 0.3s ease;
  `;

  const iconMap = {
    success: '✅',
    error: '❌',
    info: '💡'
  };

  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="font-size: 24px;">${iconMap[type] || '✅'}</div>
      <div style="flex: 1;">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px; color: var(--text-primary);">${title}</div>
        <div style="font-size: 14px; color: var(--text-secondary); white-space: pre-line;">${message}</div>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Utility Functions
function formatPrice(price) {
  return price.toLocaleString('ko-KR');
}

function getCategoryEmoji(category) {
  const emojis = {
    game: '🎮',
    figure: '🗿',
    anime: '📺',
    manga: '📚',
    card: '🃏',
    plush: '🧸',
    merch: '✨'
  };
  return emojis[category] || '🎯';
}

function getColorForCategory(category) {
  const colors = {
    game: '8B5CF6',
    figure: '3B82F6',
    anime: 'EC4899',
    manga: '10B981',
    card: 'F59E0B',
    plush: 'EF4444',
    merch: '6366F1'
  };
  return colors[category] || '8B5CF6';
}

// Global functions for onclick handlers
window.showLoginModal = showLoginModal;
window.showSellModal = showSellModal;
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
window.closeModal = closeModal;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleLogout = handleLogout;
window.handleSocialLogin = handleSocialLogin;
window.handleSellProduct = handleSellProduct;
window.showProductDetail = showProductDetail;
window.toggleFavorite = toggleFavorite;
window.performSearch = performSearch;
window.toggleDropdown = toggleDropdown;
window.closeDropdown = closeDropdown;
window.viewMyProfile = viewMyProfile;
window.viewMyListings = viewMyListings;
window.viewFavorites = viewFavorites;

// Add fadeOut animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-20px); }
  }
`;
document.head.appendChild(style);

console.log('🚀 오타쿠 마켓 (Firebase 버전) 초기화 완료!');
