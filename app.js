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
  deleteDoc,
  updateProfile,
  writeBatch
} from "./firebase-config.js";

// ===== 전역 변수 =====
let products = [];
let currentProducts = [];
let communityPosts = [];
let favorites = new Set(JSON.parse(localStorage.getItem('favorites')) || []);
let communityFavorites = new Set(JSON.parse(localStorage.getItem('communityFavorites')) || []);
let currentUser = null;
let activeTab = 'home'; // 'home' or 'community'
let currentChatId = null;
let chatMessagesListener = null;
let chatListListener = null;

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  // 테마 초기화
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  initializeAuth();
  loadProducts();
  loadCommunityPosts(); // 커뮤니티 게시글 로드
  loadUserStats(); // 유저 통계 (가입자 수 등)
  setupEventListeners();
  updateThemeIcon();

  switchTab('home');

  console.log('🚀 덕질(DuckZil) 초기화 완료');
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
  const communityBtnLabel = activeTab === 'community' ? '🛍️ 마켓으로' : '💬 커뮤니티';
  const communityBtnAction = activeTab === 'community' ? `switchTab('home')` : `switchTab('community')`;

  const communityBtn = `<button class="btn btn-secondary" onclick="${communityBtnAction}" id="headerCommunityBtn">${communityBtnLabel}</button>`;

  if (currentUser) {
    const avatarText = currentUser.photoURL
      ? `<img src="${currentUser.photoURL}" alt="프로필" style="width: 100%; height: 100%; border-radius: 50%;">`
      : currentUser.nickname.charAt(0);

    headerActions.innerHTML = `
      ${themeBtn}
      ${communityBtn}
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
          <div class="dropdown-item" onclick="event.stopPropagation(); showChatList()">
            <span>💬</span> 내 채팅 목록
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
      ${communityBtn}
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
    const soldProducts = products.filter(p => p.status === 'sold');
    animateValue("statProducts", 0, products.length, 1000);
    animateValue("statTrades", 0, soldProducts.length, 1000);
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
  const tradeMethod = document.getElementById('sellTradeMethod').value;

  const categoryNames = { game: '게임', figure: '피규어', anime: '애니 굿즈', manga: '만화책', card: '카드/TCG', plush: '인형/플러시', merch: '기타 굿즈' };
  const conditionNames = { 'new': '미개봉 새상품', 'like-new': '거의 새것', 'good': '양호', 'fair': '사용감 있음' };
  const tradeMethodNames = { direct: '🤝 직거래', shipping: '📦 택배거래', both: '🔄 직거래/택배 모두 가능' };
  const regionNames = { seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산', daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북', jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주' };

  const previewContainer = document.getElementById('sellPreview');
  const uploadedImg = previewContainer.querySelector('img');
  const image = uploadedImg ? uploadedImg.src : 'placeholder.jpg';

  try {
    await addDoc(collection(db, 'products'), {
      title, category, categoryName: categoryNames[category],
      price, condition, conditionName: conditionNames[condition],
      tradeMethod, tradeMethodName: tradeMethodNames[tradeMethod],
      location: regionNames[region] || '서울', region: region || 'seoul',
      image,
      seller: currentUser.nickname, sellerEmail: currentUser.email, sellerUID: currentUser.uid,
      description, badge: 'new', views: 0, likes: 0,
      status: 'selling', // 기본 상태: 판매 중
      createdAt: new Date()
    });
    closeModal('sellModal');
    document.getElementById('sellForm').reset();
    previewContainer.innerHTML = '';
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

// ===== 커뮤니티 관리 (Community Management) =====

async function loadCommunityPosts() {
  const postsRef = collection(db, 'communityPosts');
  const q = query(postsRef, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snapshot) => {
    communityPosts = [];
    snapshot.forEach((doc) => {
      communityPosts.push({ id: doc.id, ...doc.data() });
    });

    if (activeTab === 'community') {
      renderCommunity();
    }
  });
}

function showCommunityWriteModal() {
  if (!currentUser) {
    showNotification('로그인 필요', '게시글을 쓰려면 로그인이 필요합니다.', 'error');
    showLoginModal();
    return;
  }
  document.getElementById('communityWriteModal').classList.add('active');
}

async function handlePostCommunity(event) {
  event.preventDefault();
  if (!currentUser) return;

  const category = document.getElementById('postCategory').value;
  const content = document.getElementById('postContent').value;

  const categoryNames = {
    general: '자유글',
    question: '질문/정보',
    boast: '득템 인증',
    collection: '컬렉션'
  };

  try {
    await addDoc(collection(db, 'communityPosts'), {
      category,
      categoryName: categoryNames[category] || '자유글',
      content,
      author: currentUser.nickname,
      authorUID: currentUser.uid,
      likes: 0,
      createdAt: new Date()
    });
    closeModal('communityWriteModal');
    document.getElementById('communityWriteForm').reset();
    showNotification('등록 완료', '게시글이 등록되었습니다.');
  } catch (error) {
    console.error('커뮤니티 등록 오류:', error);
    showNotification('등록 실패', '오류가 발생했습니다.', 'error');
  }
}

async function togglePostLike(postId) {
  const post = communityPosts.find(p => p.id === postId);
  if (!post) return;

  if (communityFavorites.has(postId)) {
    communityFavorites.delete(postId);
    await updateDoc(doc(db, 'communityPosts', postId), { likes: Math.max(0, (post.likes || 0) - 1) });
  } else {
    communityFavorites.add(postId);
    await updateDoc(doc(db, 'communityPosts', postId), { likes: (post.likes || 0) + 1 });
  }
  localStorage.setItem('communityFavorites', JSON.stringify(Array.from(communityFavorites)));
}

function renderCommunity() {
  const grid = document.getElementById('communityGrid');
  if (communityPosts.length === 0) {
    grid.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
        <div style="font-size: 18px; font-weight: 600;">아직 게시글이 없습니다. 첫 덕질의 흔적을 남겨보세요!</div>
      </div>`;
    return;
  }

  grid.innerHTML = communityPosts.map(post => {
    const timeStr = post.createdAt?.seconds
      ? new Date(post.createdAt.seconds * 1000).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '방금 전';

    const isLiked = communityFavorites.has(post.id);

    return `
      <div class="community-card">
        <div class="community-header">
          <div class="community-user">
            <div class="community-avatar">${(post.author || '덕후').charAt(0)}</div>
            <div class="community-user-info">
              <div class="community-nickname">${post.author || '익명 덕후'}</div>
              <div class="community-time">${timeStr}</div>
            </div>
          </div>
          <div class="community-category">${post.categoryName}</div>
        </div>
        <div class="community-content">${post.content}</div>
        <div class="community-footer">
          <div class="community-action ${isLiked ? 'liked' : ''}" onclick="togglePostLike('${post.id}')">
            ${isLiked ? '❤️' : '🤍'} ${post.likes || 0}
          </div>
          <div class="community-action" onclick="showNotification('준비 중', '댓글 기능은 준비 중입니다.', 'info')">
            💬 댓글
          </div>
        </div>
      </div>
    `;
  }).join('');
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
  document.getElementById('editTradeMethod').value = product.tradeMethod || '';
  document.getElementById('editDescription').value = product.description;
  document.getElementById('editRegion').value = product.region || 'seoul';

  closeModal('productModal');

  // Show current image in preview
  const editPreview = document.getElementById('editPreview');
  editPreview.innerHTML = `
    <div class="preview-item">
      <img src="${product.image}" alt="current">
      <button type="button" class="remove-img-btn" onclick="this.parentElement.remove()">×</button>
    </div>
  `;

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
  const tradeMethod = document.getElementById('editTradeMethod').value;

  const categoryNames = { game: '게임', figure: '피규어', anime: '애니 굿즈', manga: '만화책', card: '카드/TCG', plush: '인형/플러시', merch: '기타 굿즈' };
  const conditionNames = { 'new': '미개봉 새상품', 'like-new': '거의 새것', 'good': '양호', 'fair': '사용감 있음' };
  const tradeMethodNames = { direct: '🤝 직거래', shipping: '📦 택배거래', both: '🔄 직거래/택배 모두 가능' };
  const regionNames = { seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산', daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북', jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주' };

  const previewContainer = document.getElementById('editPreview');
  const uploadedImg = previewContainer.querySelector('img');
  const image = uploadedImg ? uploadedImg.src : 'placeholder.jpg';

  try {
    await updateDoc(doc(db, 'products', productId), {
      title, category, categoryName: categoryNames[category],
      price, condition, conditionName: conditionNames[condition],
      tradeMethod, tradeMethodName: tradeMethodNames[tradeMethod],
      location: regionNames[region] || '서울', region: region || 'seoul',
      image,
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
  notification.style.cursor = 'pointer'; // 클릭 가능함을 시각적으로 알림
  notification.innerHTML = `
    <div class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</div>
    <div class="notification-content"><div class="notification-title">${title}</div><div class="notification-message">${message}</div></div>
  `;

  // 클릭 시 즉시 삭제
  notification.onclick = () => {
    notification.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => notification.remove(), 300);
  };

  container.appendChild(notification);

  // 3초 후 자동 삭제 (이미 클릭해서 삭제되지 않은 경우에만)
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'fadeOut 0.5s ease forwards';
      setTimeout(() => notification.remove(), 500);
    }
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
      ${product.status === 'sold' ? '<div class="sold-overlay"><span>판매 완료</span></div>' : product.status === 'reserved' ? '<div class="sold-overlay" style="background: rgba(245, 158, 11, 0.7);"><span>예약 중</span></div>' : ''}
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
  document.getElementById('modalTradeMethod').textContent = product.tradeMethodName || '미지정';
  document.getElementById('modalDescription').textContent = product.description;

  // 판매자 정보 업데이트
  const sellerNameEl = document.getElementById('modalSeller');
  const sellerAvatarEl = document.getElementById('modalSellerAvatar');

  if (sellerNameEl) sellerNameEl.textContent = product.seller || '판매자';
  if (sellerAvatarEl) {
    const avatarChar = (product.seller || '판매자').charAt(0);
    sellerAvatarEl.textContent = avatarChar;
  }

  const modalActions = document.querySelector('#productModal .modal-actions');

  if (currentUser && (currentUser.uid === product.sellerUID || currentUser.email === product.sellerEmail)) {
    const statusBtnLabel = product.status === 'sold' ? '🔄 다시 판매하기' : '✅ 판매 완료';
    const nextStatus = product.status === 'sold' ? 'selling' : 'sold';
    const statusBtnColor = product.status === 'sold' ? 'var(--secondary)' : 'var(--success)';

    const reserveBtnLabel = product.status === 'reserved' ? '🔄 예약 취소' : '📅 예약 중으로 변경';
    const nextReserveStatus = product.status === 'reserved' ? 'selling' : 'reserved';
    const reserveBtnColor = product.status === 'reserved' ? 'var(--secondary)' : '#f59e0b';

    modalActions.innerHTML = `
      <div style="flex-direction: column; gap: 8px; width: 100%; display: flex;">
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-large" style="background-color: ${statusBtnColor}; flex: 1;" onclick="updateProductStatus('${product.id}', '${nextStatus}')">${statusBtnLabel}</button>
          <button class="btn btn-primary btn-large" style="background-color: ${reserveBtnColor}; flex: 1;" onclick="updateProductStatus('${product.id}', '${nextReserveStatus}')">${reserveBtnLabel}</button>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-large" style="background-color: #ef4444; color: white; border: none; flex: 1;" onclick="handleDeleteProduct('${product.id}')">🗑️ 삭제</button>
          <button class="btn btn-primary btn-large" style="flex: 1;" onclick="showEditModal('${product.id}')">✏️ 수정</button>
          <button class="btn btn-secondary btn-large" style="flex: 1;" onclick="closeModal('productModal')">닫기</button>
        </div>
      </div>
    `;
  } else {
    modalActions.innerHTML = `
      <div style="display: flex; gap: 8px; width: 100%;">
        <button class="btn btn-secondary btn-large" style="flex: 1;" ${product.status === 'sold' ? 'disabled' : ''} onclick="startChat('${product.id}', '${product.sellerUID}', '${product.seller}')">💬 채팅하기</button>
        <button class="btn btn-primary btn-large" style="flex: 1;" ${product.status === 'sold' ? 'disabled' : ''} onclick="handlePurchaseProduct('${product.id}')">${product.status === 'sold' ? '품절' : '💰 구매하기'}</button>
      </div>
    `;
  }
  document.getElementById('productModal').classList.add('active');
}

async function updateProductStatus(productId, newStatus) {
  try {
    await updateDoc(doc(db, 'products', productId), {
      status: newStatus,
      updatedAt: new Date()
    });

    // 모달 닫기 및 알림
    closeModal('productModal');
    const msg = newStatus === 'sold' ? '상품이 판매 완료 처리되었습니다.' : '상품이 다시 판매 중으로 변경되었습니다.';
    showNotification('상태 변경', msg);
  } catch (error) {
    console.error('상태 변경 오류:', error);
    showNotification('변경 실패', '오류가 발생했습니다.', 'error');
  }
}

window.updateProductStatus = updateProductStatus;

function performSearch() {
  if (activeTab !== 'home') {
    switchTab('home');
    // 상단 내비 전체 탭 활성화
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => nav.classList.toggle('active', nav.getAttribute('data-category') === 'all'));
  }
  applyFilters();
}

function applyFilters() {
  const query = document.getElementById('searchInput').value.toLowerCase();

  // 칩 기반 멀티 선택 값 가져오기
  const activeCategoryChips = document.querySelectorAll('#categoryChips .chip.active');
  const selectedCategories = Array.from(activeCategoryChips).map(chip => chip.getAttribute('data-value'));
  const isAllCategories = selectedCategories.includes('all');

  const activeConditionChips = document.querySelectorAll('#conditionChips .chip.active');
  const selectedConditions = Array.from(activeConditionChips).map(chip => chip.getAttribute('data-value'));
  const isAllConditions = selectedConditions.includes('all');

  const activeRegionChips = document.querySelectorAll('#regionChips .chip.active');
  const selectedRegions = Array.from(activeRegionChips).map(chip => chip.getAttribute('data-value'));
  const isAllRegions = selectedRegions.includes('all');

  // 가격 범위
  const minPrice = Number(document.getElementById('minPrice').value) || 0;
  const maxPrice = Number(document.getElementById('maxPrice').value) || Infinity;

  currentProducts = products.filter(product => {
    // 🔍 검색어
    const matchesSearch = !query ||
      product.title.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query) ||
      (product.categoryName && product.categoryName.toLowerCase().includes(query));

    // 📁 카테고리 (복수)
    const matchesCategory = isAllCategories || selectedCategories.length === 0 || selectedCategories.includes(product.category);

    // ✨ 상태 (복수)
    const matchesCondition = isAllConditions || selectedConditions.length === 0 || selectedConditions.includes(product.condition);

    // 📍 지역 (복수)
    const matchesRegion = isAllRegions || selectedRegions.length === 0 || selectedRegions.includes(product.region);

    // 💰 가격
    const matchesPrice = product.price >= minPrice && product.price <= maxPrice;

    return matchesSearch && matchesCategory && matchesCondition && matchesRegion && matchesPrice;
  });

  renderProducts(currentProducts);
}

function toggleFavorite(productId) {
  if (favorites.has(productId)) favorites.delete(productId);
  else favorites.add(productId);
  localStorage.setItem('favorites', JSON.stringify(Array.from(favorites)));
  renderProducts(currentProducts);
}

function setupEventListeners() {
  window.onclick = function (event) {
    if (event.target.classList.contains('modal')) event.target.classList.remove('active');
    if (!event.target.matches('.user-profile') && !event.target.closest('.user-profile')) closeDropdown();
  };

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
    searchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') performSearch();
    });
  }

  // 상단 내비게이션 클릭
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      const category = item.getAttribute('data-category');

      if (tab === 'community') {
        switchTab('community');
      } else {
        switchTab('home');
        // 칩 메뉴 동기화
        if (category) {
          const container = document.getElementById('categoryChips');
          container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          const targetChip = container.querySelector(`[data-value="${category}"]`);
          if (targetChip) targetChip.classList.add('active');
          applyFilters();
        }
      }

      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // 칩 클릭 이벤트
  document.querySelectorAll('.multi-select-container').forEach(container => {
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      const value = chip.getAttribute('data-value');
      const allChip = container.querySelector('[data-value="all"]');

      if (value === 'all') {
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      } else {
        allChip.classList.remove('active');
        chip.classList.toggle('active');
        if (container.querySelectorAll('.chip.active').length === 0) {
          allChip.classList.add('active');
        }
      }

      // 상단 내비게이션과 동기화
      if (container.id === 'categoryChips') {
        const activeChips = container.querySelectorAll('.chip.active');
        const selected = Array.from(activeChips).map(c => c.getAttribute('data-value'));
        navItems.forEach(nav => {
          const navCat = nav.getAttribute('data-category');
          const isActive = (selected.includes('all') && navCat === 'all') ||
            (!selected.includes('all') && selected.includes(navCat));
          nav.classList.toggle('active', isActive);
        });
      }
      applyFilters();
    });
  });

  // 가격 슬라이더 연동
  const minSlider = document.getElementById('minPriceSlider');
  const maxSlider = document.getElementById('maxPriceSlider');
  const minInput = document.getElementById('minPrice');
  const maxInput = document.getElementById('maxPrice');

  if (minSlider && maxSlider) {
    const updateSliderTrack = () => {
      const min = parseInt(minSlider.min);
      const max = parseInt(minSlider.max);
      const val1 = ((minSlider.value - min) / (max - min)) * 100;
      const val2 = ((maxSlider.value - min) / (max - min)) * 100;
      const track = document.getElementById('sliderTrack');
      if (track) {
        track.style.background = `linear-gradient(to right, var(--bg-tertiary) ${val1}%, var(--primary) ${val1}%, var(--primary) ${val2}%, var(--bg-tertiary) ${val2}%)`;
      }
    };

    minSlider.addEventListener('input', () => {
      if (parseInt(minSlider.value) > parseInt(maxSlider.value)) {
        minSlider.value = maxSlider.value;
      }
      minInput.value = minSlider.value;
      updateSliderTrack();
      applyFilters();
    });

    maxSlider.addEventListener('input', () => {
      if (parseInt(maxSlider.value) < parseInt(minSlider.value)) {
        maxSlider.value = minSlider.value;
      }
      maxInput.value = maxSlider.value;
      updateSliderTrack();
      applyFilters();
    });

    minInput.addEventListener('input', () => {
      minSlider.value = minInput.value || 0;
      updateSliderTrack();
      applyFilters();
    });

    maxInput.addEventListener('input', () => {
      maxSlider.value = maxInput.value || 1000000;
      updateSliderTrack();
      applyFilters();
    });

    // 초기 트랙 업데이트
    updateSliderTrack();
  }
}

function resetFilters() {
  document.querySelectorAll('.multi-select-container').forEach(container => {
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    container.querySelector('[data-value="all"]').classList.add('active');
  });

  document.getElementById('minPrice').value = '';
  document.getElementById('maxPrice').value = '';
  document.getElementById('searchInput').value = '';

  const minSlider = document.getElementById('minPriceSlider');
  const maxSlider = document.getElementById('maxPriceSlider');
  if (minSlider) minSlider.value = 0;
  if (maxSlider) maxSlider.value = 1000000;
  const track = document.getElementById('sliderTrack');
  if (track) track.style.background = `linear-gradient(to right, var(--bg-tertiary) 0%, var(--primary) 0%, var(--primary) 100%, var(--bg-tertiary) 100%)`;

  // 상단 내비게이션 초기화
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(nav => nav.classList.toggle('active', nav.getAttribute('data-category') === 'all'));

  applyFilters();
  showNotification('초기화', '필터가 초기화되었습니다.', 'info');
}

function filterByCategory(category) {
  const container = document.getElementById('categoryChips');
  if (container) {
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const targetChip = container.querySelector(`[data-value="${category}"]`);
    if (targetChip) targetChip.classList.add('active');
  }

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(nav => nav.classList.toggle('active', nav.getAttribute('data-category') === category));

  applyFilters();
}

function showGuide() {
  document.getElementById('guideModal').classList.add('active');
}

function showFeeInfo() {
  document.getElementById('feeModal').classList.add('active');
}

// 마이페이지 관련 기능
function viewMyProfile() {
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  mobileNavItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === 'profile');
  });

  if (!currentUser) {
    showNotification('로그인 필요', '로그인이 필요합니다.', 'error');
    showLoginModal();
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

function showEditProfileModal() {
  if (!currentUser) return;
  document.getElementById('editNickname').value = currentUser.nickname;
  const preview = document.getElementById('profileEditPreview');
  if (currentUser.photoURL) {
    preview.innerHTML = `<img src="${currentUser.photoURL}" alt="preview" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
  } else {
    preview.textContent = currentUser.nickname.charAt(0);
  }
  closeModal('profileModal');
  document.getElementById('editProfileModal').classList.add('active');
}

async function handleUpdateProfile(event) {
  event.preventDefault();
  const newNickname = document.getElementById('editNickname').value;
  const previewImg = document.querySelector('#profileEditPreview img');
  const newPhotoURL = previewImg ? previewImg.src : currentUser.photoURL;

  try {
    // 1. Firebase Auth 프로필 업데이트
    await updateProfile(auth.currentUser, {
      displayName: newNickname,
      photoURL: newPhotoURL
    });

    // 2. Firestore 유저 문서 업데이트
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('uid', '==', currentUser.uid));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      await updateDoc(doc(db, 'users', userDoc.id), {
        nickname: newNickname,
        photoURL: newPhotoURL
      });
    }

    // 3. 작성한 상품들 닉네임 동기화
    const productsRef = collection(db, 'products');
    const pq = query(productsRef, where('sellerUID', '==', currentUser.uid));
    const productsSnapshot = await getDocs(pq);

    if (!productsSnapshot.empty) {
      const batch = writeBatch(db);
      productsSnapshot.forEach((docSnap) => {
        batch.update(doc(db, 'products', docSnap.id), { seller: newNickname });
      });
      await batch.commit();
    }

    // 4. 작성한 커뮤니티 게시글 닉네임 동기화
    const postsRef = collection(db, 'communityPosts');
    const postQ = query(postsRef, where('authorUID', '==', currentUser.uid));
    const postsSnapshot = await getDocs(postQ);

    if (!postsSnapshot.empty) {
      const batch = writeBatch(db);
      postsSnapshot.forEach((docSnap) => {
        batch.update(doc(db, 'communityPosts', docSnap.id), { author: newNickname });
      });
      await batch.commit();
    }

    // 5. 현재 로컬 상태 업데이트
    currentUser.nickname = newNickname;
    currentUser.photoURL = newPhotoURL;

    closeModal('editProfileModal');
    updateHeaderForUser();
    showNotification('성공', '프로필과 작성 글들이 업데이트되었습니다.');
  } catch (error) {
    console.error('프로필 업데이트 오류:', error);
    showNotification('실패', '업데이트 중 오류가 발생했습니다.', 'error');
  }
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
  updateMobileBanner('listings');
}

function viewFavorites() {
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  mobileNavItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === 'favorites');
  });

  if (!currentUser) {
    showNotification('로그인 필요', '찜한 상품을 보려면 로그인이 필요합니다.', 'error');
    showLoginModal();
    return;
  }

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

  showNotification('필터 적용', `${currentProducts.length}개의 상품을 찾았습니다.`);
  updateMobileBanner('favorites');
}

// 이미지 프리뷰 처리
function handleImagePreview(input, previewId) {
  const container = document.getElementById(previewId);
  container.innerHTML = '';

  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      if (previewId === 'profileEditPreview') {
        container.innerHTML = `<img src="${e.target.result}" alt="preview" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      } else {
        container.innerHTML = `
          <div class="preview-item">
            <img src="${e.target.result}" alt="preview">
            <button type="button" class="remove-img-btn" onclick="removeImage('${previewId}')">×</button>
          </div>
        `;
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function removeImage(previewId) {
  const container = document.getElementById(previewId);
  container.innerHTML = '';
  // 인풋도 초기화
  const inputId = previewId.includes('sell') ? 'sellImageInput' : 'editImageInput';
  document.getElementById(inputId).value = '';
}

window.handleImagePreview = handleImagePreview;
window.removeImage = removeImage;

function switchTab(tab) {
  activeTab = tab;
  const homeSection = document.getElementById('homeSection');
  const marketplaceSection = document.getElementById('marketplaceSection');
  const communitySection = document.getElementById('communitySection');
  const headerCommunityBtn = document.getElementById('headerCommunityBtn');
  const navItems = document.querySelectorAll('.nav-item');
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');

  const nav = document.querySelector('.nav');

  // Update Mobile Bottom Nav Active State
  mobileNavItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tab);
  });

  // Hide all sections initially
  if (homeSection) homeSection.style.display = 'none';
  if (marketplaceSection) marketplaceSection.style.display = 'none';
  if (communitySection) communitySection.style.display = 'none';
  if (nav) nav.style.display = 'none'; // Hide categories by default

  if (tab === 'home') {
    if (homeSection) homeSection.style.display = 'block';
    if (headerCommunityBtn) {
      headerCommunityBtn.innerHTML = '💬 커뮤니티';
      headerCommunityBtn.setAttribute('onclick', "switchTab('community')");
    }
    navItems.forEach(nav => nav.classList.remove('active'));
    window.scrollTo(0, 0);
  } else if (tab === 'community') {
    if (communitySection) communitySection.style.display = 'block';
    if (headerCommunityBtn) {
      headerCommunityBtn.innerHTML = '🛍️ 마켓으로';
      headerCommunityBtn.setAttribute('onclick', "switchTab('market')");
    }
    navItems.forEach(nav => nav.classList.remove('active'));
    renderCommunity();
    window.scrollTo(0, 0);
  } else if (tab === 'market') {
    if (marketplaceSection) marketplaceSection.style.display = 'block';
    if (nav) nav.style.display = 'block'; // Show categories on market
    if (headerCommunityBtn) {
      headerCommunityBtn.innerHTML = '💬 커뮤니티';
      headerCommunityBtn.setAttribute('onclick', "switchTab('community')");
    }
    // '전체' 탭 활성화 (마켓으로 올 때)
    navItems.forEach(nav => nav.classList.toggle('active', nav.getAttribute('data-category') === 'all'));
    renderProducts(currentProducts);
    window.scrollTo(0, 0);
  }
}

function updateMobileBanner(view) {
  const banner = document.getElementById('mobilePageBanner');
  const hero = document.getElementById('heroSection');
  const icon = document.getElementById('bannerIcon');
  const title = document.getElementById('bannerTitle');
  const desc = document.getElementById('bannerDesc');
  const filters = document.querySelector('.filter-section');

  if (!banner) return;

  const views = {
    home: { icon: '🏠', title: '마켓 홈', desc: '새로운 굿즈를 찾아보세요', showHero: true, showFilters: true },
    community: { icon: '💬', title: '커뮤니티', desc: '다른 덕후들과 소통하세요', showHero: false, showFilters: false },
    listings: { icon: '📦', title: '내 판매 상품', desc: '등록한 상품들을 관리하세요', showHero: false, showFilters: false },
    favorites: { icon: '❤️', title: '찜한 상품', desc: '마음에 들었던 아이템들입니다', showHero: false, showFilters: false }
  };

  const config = views[view] || views.home;

  icon.textContent = config.icon;
  title.textContent = config.title;
  desc.textContent = config.desc;

  // 모바일 전용 클래스 토글
  banner.className = `mobile-page-banner view-${view}`;

  if (window.innerWidth <= 768) {
    if (hero) hero.style.display = config.showHero ? 'block' : 'none';
    if (filters) filters.style.display = config.showFilters ? 'block' : 'none';
  } else {
    if (hero) hero.style.display = 'block';
    if (filters) filters.style.display = 'block';
  }
}

// ===== 구매 및 예약 기능 =====
async function handlePurchaseProduct(productId) {
  if (!currentUser) {
    showNotification('로그인 필요', '구매하려면 로그인이 필요합니다.', 'error');
    showLoginModal();
    return;
  }

  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (product.status === 'sold') {
    showNotification('알림', '이미 판매된 상품입니다.', 'info');
    return;
  }

  if (!confirm(`'${product.title}' 상품을 구매하시겠습니까?`)) return;

  try {
    // 상품 상태 업데이트
    await updateDoc(doc(db, 'products', productId), {
      status: 'sold',
      buyerUID: currentUser.uid,
      buyerNickname: currentUser.nickname,
      soldAt: new Date()
    });

    // 구매 내역 추가
    await addDoc(collection(db, 'purchases'), {
      productId: productId,
      productTitle: product.title,
      price: product.price,
      sellerUID: product.sellerUID,
      sellerNickname: product.seller,
      buyerUID: currentUser.uid,
      buyerNickname: currentUser.nickname,
      createdAt: new Date()
    });

    closeModal('productModal');
    showNotification('구매 성공!', '상품 구매가 완료되었습니다. 판매자와 채팅으로 상세 내용을 조율하세요!');
  } catch (error) {
    console.error('구매 오류:', error);
    showNotification('구매 실패', '오류가 발생했습니다.', 'error');
  }
}

// ===== 채팅 기능 =====
async function startChat(productId, sellerUID, sellerNickname) {
  if (!currentUser) {
    showNotification('로그인 필요', '채팅하려면 로그인이 필요합니다.', 'error');
    showLoginModal();
    return;
  }

  if (currentUser.uid === sellerUID) {
    showNotification('알림', '자신의 상품에는 채팅할 수 없습니다.', 'info');
    return;
  }

  const product = products.find(p => p.id === productId);
  if (!product) return;

  // 기존 채팅방 확인
  const chatsRef = collection(db, 'chats');
  const q = query(chatsRef,
    where('productId', '==', productId),
    where('participants', 'array-contains', currentUser.uid)
  );

  const querySnapshot = await getDocs(q);
  let chatId;

  if (querySnapshot.empty) {
    // 새 채팅방 생성
    const docRef = await addDoc(collection(db, 'chats'), {
      productId: productId,
      productTitle: product.title,
      productImage: product.image,
      sellerUID: sellerUID,
      sellerNickname: sellerNickname,
      buyerUID: currentUser.uid,
      buyerNickname: currentUser.nickname,
      participants: [currentUser.uid, sellerUID],
      lastMessage: '',
      updatedAt: new Date()
    });
    chatId = docRef.id;
  } else {
    chatId = querySnapshot.docs[0].id;
  }

  openChat(chatId, sellerNickname, product);
}

function openChat(chatId, withNickname, product) {
  currentChatId = chatId;
  const chatWithUserEl = document.getElementById('chatWithUser');
  const chatProductInfoEl = document.getElementById('chatProductInfo');

  if (chatWithUserEl) chatWithUserEl.textContent = withNickname;
  if (chatProductInfoEl) {
    chatProductInfoEl.innerHTML = `
      <img src="${product.image}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px;">
      <span>${product.title}</span>
    `;
  }

  closeModal('productModal');
  closeModal('chatListModal');
  const chatModal = document.getElementById('chatModal');
  if (chatModal) chatModal.classList.add('active');

  loadChatMessages(chatId);
}

function loadChatMessages(chatId) {
  if (chatMessagesListener) chatMessagesListener(); // 이전 리스너 해제

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  chatMessagesListener = onSnapshot(q, (snapshot) => {
    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    renderMessages(messages);
  });
}

function renderMessages(messages) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  container.innerHTML = messages.map(msg => {
    const isMine = msg.senderUID === currentUser.uid;
    const time = msg.createdAt?.seconds
      ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : '';

    return `
      <div style="display: flex; flex-direction: column; align-items: ${isMine ? 'flex-end' : 'flex-start'}; gap: 4px; margin-bottom: 8px;">
        <div style="background: ${isMine ? 'var(--primary)' : 'var(--surface-color)'}; color: ${isMine ? 'white' : 'var(--text-primary)'}; padding: 10px 14px; border-radius: ${isMine ? '18px 18px 0 18px' : '18px 18px 18px 0'}; max-width: 80%; font-size: 14px; box-shadow: var(--shadow-sm); border: ${isMine ? 'none' : '1px solid var(--glass-border)'};">
          ${msg.text}
        </div>
        <span style="font-size: 10px; color: var(--text-tertiary);">${time}</span>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !currentChatId) return;

  try {
    await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
      text: text,
      senderUID: currentUser.uid,
      senderNickname: currentUser.nickname,
      createdAt: new Date()
    });

    await updateDoc(doc(db, 'chats', currentChatId), {
      lastMessage: text,
      updatedAt: new Date()
    });

    input.value = '';
  } catch (error) {
    console.error('메시지 전송 오류:', error);
  }
}

async function showChatList() {
  if (!currentUser) {
    showNotification('로그인 필요', '로그인이 필요합니다.', 'error');
    showLoginModal();
    return;
  }

  const chatListModal = document.getElementById('chatListModal');
  if (chatListModal) chatListModal.classList.add('active');
  closeDropdown();

  const chatsRef = collection(db, 'chats');
  // participants에 현재 유저가 포함된 채팅방 가져오기
  const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid), orderBy('updatedAt', 'desc'));

  if (chatListListener) chatListListener();

  chatListListener = onSnapshot(q, (snapshot) => {
    const chats = [];
    snapshot.forEach((doc) => {
      chats.push({ id: doc.id, ...doc.data() });
    });
    renderChatList(chats);
  });
}

function renderChatList(chats) {
  const container = document.getElementById('chatList');
  if (!container) return;

  if (chats.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 40px 0;">채팅 내역이 없습니다.</div>`;
    return;
  }

  container.innerHTML = chats.map(chat => {
    const withNickname = chat.sellerUID === currentUser.uid ? chat.buyerNickname : chat.sellerNickname;
    return `
      <div class="chat-list-item" onclick="openChatFromList('${chat.id}', '${withNickname}', '${chat.productId}')" style="display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; cursor: pointer; transition: background 0.2s; border: 1px solid var(--glass-border); background: var(--surface-color); margin-bottom: 8px;">
        <img src="${chat.productImage}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;" onerror="this.src='placeholder.jpg'">
        <div style="flex: 1; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span style="font-weight: 700; font-size: 15px;">${withNickname}</span>
            <span style="font-size: 11px; color: var(--text-tertiary);">${chat.updatedAt?.seconds ? new Date(chat.updatedAt.seconds * 1000).toLocaleDateString('ko-KR') : ''}</span>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${chat.lastMessage || '대화가 없습니다.'}</div>
          <div style="font-size: 11px; color: var(--primary-light); margin-top: 4px; font-weight: 500;">${chat.productTitle}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openChatFromList(chatId, withNickname, productId) {
  const product = products.find(p => p.id === productId) || { title: '알 수 없는 상품', image: 'placeholder.jpg' };
  openChat(chatId, withNickname, product);
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
window.resetFilters = resetFilters;
window.showGuide = showGuide;
window.showFeeInfo = showFeeInfo;
window.showCommunityWriteModal = showCommunityWriteModal;
window.handlePostCommunity = handlePostCommunity;
window.togglePostLike = togglePostLike;
window.switchTab = switchTab;
window.showEditProfileModal = showEditProfileModal;
window.handleUpdateProfile = handleUpdateProfile;
window.handlePurchaseProduct = handlePurchaseProduct;
window.startChat = startChat;
window.sendMessage = sendMessage;
window.showChatList = showChatList;
window.openChatFromList = openChatFromList;

// CSS 추가
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-20px); } }
  .chat-list-item:hover { background: var(--bg-secondary) !important; border-color: var(--primary) !important; }
  #chatMessages::-webkit-scrollbar { width: 6px; }
  #chatMessages::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 10px; }
`;
document.head.appendChild(style);
