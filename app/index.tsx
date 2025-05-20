import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Alert, ActivityIndicator, Image, ScrollView, Animated, SafeAreaView, FlatList, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { FontAwesome } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, where, doc, updateDoc, getDocs, writeBatch, arrayUnion, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { useUser } from './contexts/UserContext';
import { loadSounds, playNewOrderSound, stopNewOrderSound, unloadSounds } from '../utils/soundUtils';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  imageUrl: string;
  status: 'available' | 'unavailable';
  quantity?: number;
  hasSizes?: boolean;
  sizes?: {
    [key: string]: {
      price: string;
    };
  };
  price: string;
  basePrice: string;
}

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  imageUrl?: string;
  size?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  restockHistory?: Array<{
    damages: number;
    expirationDate: string;
    quantity: number;
  }>;
}

interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  timestamp: any;
  customerName: string;
  customerId: string;
  staffId: string;
  staffEmail: string;
  paymentMethod: 'cash' | 'gcash' | 'maya' | 'grabpay';
  diningMode: 'dine-in' | 'takeout';
  source: 'pos' | 'customer';
  createdAt?: any;
}

export default function Index() {
  const { user: authUser, role } = useUser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDiningModal, setShowDiningModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<'cash' | 'gcash' | 'maya' | 'grabpay' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [diningMode, setDiningMode] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [consumptionModalVisible, setConsumptionModalVisible] = useState(false);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [consumptionSuccessVisible, setConsumptionSuccessVisible] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Order[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Array<{
    [x: string]: any;id: string; name: string; quantity: number
  }>>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedItemDetails, setSelectedItemDetails] = useState<InventoryItem | null>(null);
  const [selectedItemExpiries, setSelectedItemExpiries] = useState<Array<{date: string; quantity: number}>>([]);
  const [consumptionAmount, setConsumptionAmount] = useState('');
  const [selectedExpiryDate, setSelectedExpiryDate] = useState<string | null>(null);
  const [lastConsumptionAlert, setLastConsumptionAlert] = useState<Date | null>(null);
  // Add new state variable for notification sound setting
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  // Add new state for success modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState<string>('');

  // Add back tax and payment settings
  const [taxSettings, setTaxSettings] = useState<{ enabled: boolean; percentage: number; label: string; embedded: boolean }>({
    enabled: false,
    percentage: 0,
    label: '',
    embedded: false
  });

  const [paymentSettings, setPaymentSettings] = useState<{
    enableCash: boolean;
    enableGCash: boolean;
    enableMaya: boolean;
    enableGrabPay: boolean;
    autoApplyServiceCharge: boolean;
    serviceChargePercentage: number;
  }>({
    enableCash: true,
    enableGCash: true,
    enableMaya: true,
    enableGrabPay: true,
    autoApplyServiceCharge: false,
    serviceChargePercentage: 0
  });

  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Add new state variables for discounts
  const [isPwdDiscount, setIsPwdDiscount] = useState(false);
  const [isSeniorDiscount, setIsSeniorDiscount] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(20); // Default 20% discount

  const sidebarAnimation = useRef(new Animated.Value(-300)).current;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetchInventoryItems();
    loadTaxSettings();
    loadPaymentSettings();
    loadDiscountSettings();
    
    // Store the unsubscribe function from the general settings listener
    const unsubscribeSettings = loadGeneralSettings();
    
    // Clean up the subscription when component unmounts
    return () => {
      if (unsubscribeSettings && typeof unsubscribeSettings.then === 'function') {
        unsubscribeSettings.then(unsub => {
          if (unsub) unsub();
        });
      }
    };
  }, []);

  useEffect(() => {
    // Load sounds when component mounts
    const loadSoundsAsync = async () => {
      await loadSounds();
    };
    loadSoundsAsync();

    // Clean up sounds when component unmounts
    return () => {
      const cleanUp = async () => {
        await unloadSounds();
      };
      cleanUp();
    };
  }, []);

  useEffect(() => {
    // Play alert sound if there are pending customer orders
    const handlePendingOrders = async () => {
      if (notifications.length > 0) {
        // Only play sound if notification sound is enabled in settings
        if (notificationSoundEnabled) {
          await playNewOrderSound();
        } else {
          await stopNewOrderSound();
        }
      } else {
        await stopNewOrderSound();
      }
    };
    
    handlePendingOrders();
  }, [notifications, notificationSoundEnabled]);

  useEffect(() => {
    // Subscribe to new customer orders
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('source', '==', 'customer'),
      where('status', '==', 'pending'),
      where('paymentStatus', '==', 'paid')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newOrders = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Safely handle Firestore timestamps
          createdAt: data.createdAt
        };
      }) as Order[];
      
      setNotifications(newOrders);
      setHasUnreadNotifications(newOrders.length > 0);
    });

    // Check for daily consumption alert
    const checkDailyConsumption = async () => {
      const settingsRef = doc(db, 'settings', 'consumptionAlerts');
      const settingsDoc = await getDoc(settingsRef);
      const lastAlert = settingsDoc.exists() ? new Date(settingsDoc.data().lastAlert) : null;
      
      const now = new Date();
      if (!lastAlert || (now.getTime() - lastAlert.getTime()) >= 24 * 60 * 60 * 1000) {
        Alert.alert(
          'Daily Consumption Reminder',
          'Please record your daily inventory consumption.',
          [
            {
              text: 'Record Now',
              onPress: () => setConsumptionModalVisible(true)
            },
            {
              text: 'Later',
              style: 'cancel'
            }
          ]
        );
        
        // Update last alert time in Firestore
        await setDoc(settingsRef, { lastAlert: now.toISOString() }, { merge: true });
        setLastConsumptionAlert(now);
      }
    };

    checkDailyConsumption();
    const dailyCheck = setInterval(checkDailyConsumption, 60 * 60 * 1000); // Check every hour

    return () => {
      unsubscribe();
      clearInterval(dailyCheck);
    };
  }, []);

  useEffect(() => {
    const fetchItemDetails = async () => {
      if (selectedItem) {
        try {
          const itemRef = doc(db, 'inventory', selectedItem);
          const itemDoc = await getDoc(itemRef);
          if (itemDoc.exists()) {
            setSelectedItemDetails({ id: itemDoc.id, ...itemDoc.data() } as InventoryItem);
          }
        } catch (error) {
          console.error('Error fetching item details:', error);
        }
      } else {
        setSelectedItemDetails(null);
      }
    };

    fetchItemDetails();
  }, [selectedItem]);

  useEffect(() => {
    if (selectedItem && selectedItemDetails?.restockHistory) {
      // Get current date for expiry check
      const now = new Date();
      
      // Group quantities by expiration date and filter out expired batches
      const expiries = selectedItemDetails.restockHistory.reduce((acc, entry) => {
        // Skip expired batches
        const expiryDate = new Date(entry.expirationDate);
        if (expiryDate <= now) {
          return acc;
        }
        
        const availableQuantity = entry.quantity - (entry.damages || 0);
        const existingEntry = acc.find(e => e.date === entry.expirationDate);
        
        if (existingEntry) {
          existingEntry.quantity += availableQuantity;
        } else if (availableQuantity > 0) {
          acc.push({ date: entry.expirationDate, quantity: availableQuantity });
        }
        return acc;
      }, [] as Array<{date: string; quantity: number}>);
      
      // Sort by expiration date
      expiries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSelectedItemExpiries(expiries);
    } else {
      setSelectedItemExpiries([]);
    }
  }, [selectedItem, selectedItemDetails]);

  useEffect(() => {
    fetchInventoryItems();
    // Subscribe to categories
    const unsubscribeCategories = onSnapshot(
      collection(db, 'categories'),
      (snapshot) => {
        const categoriesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Category[];
        setCategories(categoriesData);
        
        // Add "All" category at the beginning
        const allCategory = { id: 'all', name: 'All' };
        setCategories([allCategory, ...categoriesData]);
        
        // Select "All" category by default
        if (!selectedCategory) {
          setSelectedCategory(allCategory);
        }
      },
      (error) => {
        console.error('Error fetching categories:', error);
      }
    );

    // Subscribe to products
    const unsubscribeProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const productsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
        setProducts(productsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching products:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeCategories();
      unsubscribeProducts();
    };
  }, []);

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory?.id === 'all' || product.categoryId === selectedCategory?.id;
    const matchesSearch = searchQuery.trim() === '' || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchesCategory && matchesSearch;
  });

  const loadTaxSettings = async () => {
    // VAT is now automatically embedded in the price, no need to load settings
    // Just set a default configuration
    setTaxSettings({ 
      enabled: true, 
      percentage: 12, 
      label: 'VAT',
      embedded: true
    });
  };

  const loadPaymentSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'config');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const settings = settingsDoc.data();
        if (settings.payment) {
          setPaymentSettings(settings.payment);
        }
      }
      setIsSettingsLoaded(true);
    } catch (error) {
      console.error('Error loading payment settings:', error);
      setIsSettingsLoaded(true);
    }
  };

  const loadDiscountSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'config');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists() && settingsDoc.data().discounts?.percentage) {
        setDiscountPercentage(settingsDoc.data().discounts.percentage);
      }
    } catch (error) {
      console.error('Error loading discount settings:', error);
    }
  };

  const loadGeneralSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'config');
      // Set up a real-time listener for settings changes
      const unsubscribe = onSnapshot(settingsRef, (doc) => {
        if (doc.exists()) {
          const settings = doc.data();
          if (settings.general) {
            setNotificationSoundEnabled(settings.general.notificationSound ?? true);
          }
        }
      }, (error) => {
        console.error('Error listening to general settings:', error);
      });
      
      // Return unsubscribe function to clean up the listener
      return unsubscribe;
    } catch (error) {
      console.error('Error loading general settings:', error);
    }
  };

  const calculateTax = (total: number) => {
    // Calculate VAT as exactly 12% of the total price
    return total * 0.12;
  };

  const calculateServiceCharge = (subtotal: number) => {
    if (!paymentSettings?.autoApplyServiceCharge) return 0;
    return (subtotal * (paymentSettings?.serviceChargePercentage || 0)) / 100;
  };
  
  // Add discount calculation function
  const calculateDiscount = (subtotal: number) => {
    if (isPwdDiscount || isSeniorDiscount) {
      return (subtotal * discountPercentage) / 100;
    }
    return 0;
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce((total, item) => total + item.total, 0);
    // Tax is already embedded in the subtotal, so we don't add it again
    const serviceCharge = calculateServiceCharge(subtotal);
    const discount = calculateDiscount(subtotal);
    return subtotal + serviceCharge - discount;
  };

  const toggleSidebar = () => {
    const toValue = sidebarOpen ? -300 : 0;
    Animated.timing(sidebarAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setSidebarOpen(!sidebarOpen);
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setQuantity(1);
    if (product.hasSizes) {
      setSelectedSize('');
      setIsModalVisible(true);
    } else {
      handleAddToCart(product);
    }
  };

  const handleSizeSelect = (sizeName: string) => {
    setSelectedSize(sizeName);
  };

  const handleAddToCart = (product: Product) => {
    if (!product) return;

    const price = product.hasSizes && selectedSize 
      ? product.sizes?.[selectedSize]?.price 
      : product.basePrice;

    if (!price) return;

    const itemName = product.hasSizes && selectedSize 
      ? `${product.name} (${selectedSize})` 
      : product.name;

    const existingItemIndex = cart.findIndex(item => 
      item.name === itemName && item.size === (selectedSize || undefined)
    );

    if (existingItemIndex !== -1) {
      const updatedCart = [...cart];
      updatedCart[existingItemIndex].quantity += quantity;
      updatedCart[existingItemIndex].total = 
        updatedCart[existingItemIndex].price * updatedCart[existingItemIndex].quantity;
      setCart(updatedCart);
    } else {
      const newItem: CartItem = {
        id: product.id,
        name: itemName,
        price: Number(price),
        quantity: quantity,
        total: Number(price) * quantity,
        imageUrl: product.imageUrl,
        size: selectedSize || undefined
      };
      setCart([...cart, newItem]);
    }

    setSelectedProduct(null);
    setSelectedSize('');
    setQuantity(1);
    setIsModalVisible(false);
  };

  const updateQuantity = (productId: string, newQuantity: number, size?: string) => {
    if (newQuantity < 1) {
      setCart(cart.filter(item => item.id !== productId || item.size !== size));
      return;
    }
    
    setCart(cart.map(item =>
      item.id === productId && item.size === size
        ? { ...item, quantity: newQuantity, total: item.price * newQuantity }
        : item
    ));
  };

  const removeFromCart = (productId: string, size?: string) => {
    setCart(cart.filter(item => item.id !== productId || item.size !== size));
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      Alert.alert('Error', 'Cart is empty');
      return;
    }

    if (!paymentSettings.enableCash && !paymentSettings.enableGCash && !paymentSettings.enableMaya && !paymentSettings.enableGrabPay) {
      Alert.alert('Error', 'No payment methods are enabled in settings');
      return;
    }

    setShowPaymentModal(true);
  };

  const handlePaymentMethodSelect = (method: 'cash' | 'gcash' | 'maya' | 'grabpay') => {
    if (method === 'cash' && !paymentSettings.enableCash) {
      Alert.alert('Error', 'Cash payments are disabled');
      return;
    }
    if (method === 'gcash' && !paymentSettings.enableGCash) {
      Alert.alert('Error', 'GCash payments are disabled');
      return;
    }
    if (method === 'maya' && !paymentSettings.enableMaya) {
      Alert.alert('Error', 'Maya payments are disabled');
      return;
    }
    if (method === 'grabpay' && !paymentSettings.enableGrabPay) {
      Alert.alert('Error', 'GrabPay payments are disabled');
      return;
    }
    setPaymentMethod(method);
    setShowDiningModal(true);
    setShowPaymentModal(false);
  };

  const processOrder = async () => {
    try {
      setIsProcessing(true);
      
      const total = cart.reduce((sum, item) => sum + item.total, 0);
      // Calculate subtotal as exactly 88% of the total
      const subtotal = total * 0.88;
      // VAT is exactly 12% of the total
      const tax = total * 0.12;
      const serviceCharge = calculateServiceCharge(subtotal);
      const discount = calculateDiscount(subtotal);
      const finalTotal = total + serviceCharge - discount;

      // Get user name from Firestore
      let staffName = 'Unknown Staff';
      if (authUser?.uid) {
        const userDoc = await getDoc(doc(db, 'users', authUser.uid));
        if (userDoc.exists()) {
          staffName = userDoc.data().name || 'Unknown Staff';
        }
      }
      
      // Add Owner label if user is owner
      const isOwner = role === 'owner';
      const staffDisplayName = isOwner ? `${staffName}` : staffName;

      // Create order object with tax and service charge details
      const orderData = {
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          total: item.total,
          size: item.size
        })),
        total: finalTotal, // Use finalTotal here instead of total for consistency
        subtotal,
        tax: {
          amount: tax,
          percentage: taxSettings?.percentage || 12,
          label: taxSettings?.label || 'VAT',
          embedded: true
        },
        serviceCharge: {
          amount: serviceCharge,
          percentage: paymentSettings?.serviceChargePercentage || 0
        },
        discount: discount > 0 ? {
          amount: discount,
          percentage: discountPercentage,
          type: isPwdDiscount ? 'PWD' : isSeniorDiscount ? 'Senior Citizen' : 'Manual Discount'
        } : null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        staffId: authUser?.uid || '',
        staffEmail: authUser?.email || '',
        staffName: staffDisplayName,
        paymentMethod,
        diningMode,
        source: 'pos'
      };

      // Create order in Firestore
      const orderRef = await addDoc(collection(db, 'orders'), orderData);

      // Clear cart and reset states
      setCart([]);
      setPaymentMethod('');
      setDiningMode('');
      setIsProcessing(false);

      // Show success message
      Alert.alert(
        'Success',
        'Order created successfully!',
        [{ text: 'OK', onPress: () => console.log('OK Pressed') }]
      );

    } catch (error) {
      console.error('Error processing order:', error);
      setIsProcessing(false);
      Alert.alert('Error', 'Failed to process order. Please try again.');
    }
  };

  const handleDiningModeSelect = async (mode: string) => {
    try {
      if (!authUser) {
        Alert.alert('Error', 'Please log in to process orders');
        return;
      }

      // Calculate the total order amount
      const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
      // Calculate subtotal as exactly 88% of the total
      const cartSubtotal = cartTotal * 0.88;
      // VAT is exactly 12% of the total
      const cartTax = cartTotal * 0.12;
      const cartServiceCharge = calculateServiceCharge(cartSubtotal);
      const cartDiscount = calculateDiscount(cartSubtotal);
      const orderTotal = cartTotal + cartServiceCharge - cartDiscount;

      // Prepare the order items with correct total calculation
      const orderItems = cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        size: item.size || null,
        total: item.price * item.quantity
      }));

      // Get user role to check if it's the owner
      const isOwner = role === 'owner';
      
      // Get user name from Firestore
      let staffName = 'Unknown Staff';
      if (authUser.uid) {
        const userDoc = await getDoc(doc(db, 'users', authUser.uid));
        if (userDoc.exists()) {
          staffName = userDoc.data().name || 'Unknown Staff';
        }
      }
      
      const staffDisplayName = isOwner ? `${staffName}` : staffName;

      const orderData = {
        items: orderItems,
        subtotal: cartSubtotal,
        tax: {
          amount: cartTax,
          percentage: taxSettings?.percentage || 12,
          label: taxSettings?.label || 'VAT',
          embedded: true
        },
        serviceCharge: {
          amount: cartServiceCharge,
          percentage: paymentSettings?.serviceChargePercentage || 0
        },
        discount: cartDiscount > 0 ? {
          amount: cartDiscount,
          percentage: discountPercentage,
          type: isPwdDiscount ? 'PWD' : isSeniorDiscount ? 'Senior Citizen' : 'Manual Discount'
        } : null,
        total: orderTotal,
        status: 'completed',
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp(),
        customerName: 'Walk-in Customer',
        customerEmail: customerEmail || null,
        paymentMethod,
        diningMode: mode,
        source: 'pos',
        staffId: authUser.uid,
        staffEmail: authUser.email,
        staffName: staffDisplayName,
        processingStartTime: serverTimestamp(),
        readyTime: serverTimestamp(),
      };

      // Add the order to Firestore
      const ordersRef = collection(db, 'orders');
      const orderDoc = await addDoc(ordersRef, orderData);

      // Reset discount flags after order is complete
      setIsPwdDiscount(false);
      setIsSeniorDiscount(false);

      // If customer email is provided, add points to their account
      if (customerEmail) {
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where('email', '==', customerEmail));
        const userSnapshot = await getDocs(userQuery);

        // Calculate points based on total quantity of items
        const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const pointsToAdd = totalQuantity; // 1 point per item

        if (!userSnapshot.empty) {
          // User exists, update points
          const userDoc = userSnapshot.docs[0];
          const currentPoints = userDoc.data().points || 0;
          await updateDoc(userDoc.ref, {
            points: currentPoints + pointsToAdd
          });
        } else {
          // Create new user with points
          await addDoc(usersRef, {
            email: customerEmail,
            points: pointsToAdd,
            name: 'Walk-in Customer'
          });
        }

        // Set success data and show modal instead of Alert
        setSuccessOrderId(orderDoc.id);
        setShowSuccessModal(true);
      } else {
        // Set success data and show modal instead of Alert
        setSuccessOrderId(orderDoc.id);
        setShowSuccessModal(true);
      }

      // Clear the cart and states after successful order
      setCart([]);
      setPaymentMethod(null);
      setDiningMode(null);
      setShowDiningModal(false);
      setCustomerEmail('');
    } catch (error) {
      console.error('Error processing order:', error);
      Alert.alert(
        'Error',
        'Failed to process order. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Error logging out:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  const fetchInventoryItems = async () => {
    try {
      const inventoryRef = collection(db, 'inventory');
      const snapshot = await getDocs(inventoryRef);
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        quantity: doc.data().quantity
      }));
      setInventoryItems(items);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const handleConsumption = async () => {
    try {
      // Clear any previous errors
      setConsumptionError(null);
      
      if (!selectedItem || !consumptionAmount || !selectedExpiryDate) {
        setConsumptionError('Please select an item, expiration date, and enter consumption amount');
        return;
      }

      if (!authUser) {
        setConsumptionError('You must be logged in to perform this action');
        return;
      }

      const amount = parseInt(consumptionAmount);
      if (isNaN(amount) || amount <= 0) {
        setConsumptionError('Please enter a valid consumption amount');
        return;
      }

      const item = inventoryItems.find(i => i.id === selectedItem);
      if (!item) {
        setConsumptionError('Item not found');
        return;
      }

      if (amount > item.quantity) {
        setConsumptionError('Consumption amount cannot be greater than current stock');
        return;
      }

      // Validate expiration date
      const expiryDate = new Date(selectedExpiryDate);
      if (isNaN(expiryDate.getTime())) {
        setConsumptionError('Invalid expiration date format');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', authUser.uid));
        const staffName = userDoc.exists() ? userDoc.data().name : 'Unknown Staff';
        const itemRef = doc(db, 'inventory', selectedItem);
        
        const currentItemDoc = await getDoc(itemRef);
        if (!currentItemDoc.exists()) {
          setConsumptionError('Item not found in database');
          return;
        }
        const currentItem = currentItemDoc.data();
        
        // Make sure we're not dealing with an expired batch
        const now = new Date();
        const selectedBatchExpiryDate = new Date(selectedExpiryDate);
        
        if (selectedBatchExpiryDate <= now) {
          setConsumptionError('Cannot consume from expired batch. Please select a valid batch.');
          return;
        }
        
        const selectedBatch = currentItem.restockHistory.find(
          (entry: { expirationDate: string }) => entry.expirationDate === selectedExpiryDate
        );

        if (!selectedBatch) {
          setConsumptionError('Selected batch not found');
          return;
        }

        if (amount > selectedBatch.quantity) {
          setConsumptionError('Consumption amount cannot be greater than batch quantity');
          return;
        }

        const updatedRestockHistory = currentItem.restockHistory.map(
          (entry: { expirationDate: string; quantity: number }) => {
            if (entry.expirationDate === selectedExpiryDate) {
              return {
                ...entry,
                quantity: entry.quantity - amount
              };
            }
            return entry;
          }
        ).filter((entry: { quantity: number }) => entry.quantity > 0);

        const consumptionEntry = {
          date: new Date().toISOString(),
          quantity: amount,
          staffName: staffName,
          staffEmail: authUser.email || 'Unknown Email',
          expirationDate: selectedExpiryDate
        };

        await updateDoc(itemRef, {
          quantity: currentItem.quantity - amount,
          consumptionHistory: arrayUnion(consumptionEntry),
          restockHistory: updatedRestockHistory
        });

        setInventoryItems(inventoryItems.map(i => 
          i.id === selectedItem 
            ? { 
                ...i, 
                quantity: i.quantity - amount,
                restockHistory: updatedRestockHistory
              }
            : i
        ));

        const settingsRef = doc(db, 'settings', 'consumptionAlerts');
        await setDoc(settingsRef, { lastAlert: new Date().toISOString() }, { merge: true });
        setLastConsumptionAlert(new Date());

        setConsumptionModalVisible(false);
        setSelectedItem(null);
        setConsumptionAmount('');
        setSelectedExpiryDate(null);
        setConsumptionError(null);
        
        // Show success modal instead of alert
        setConsumptionSuccessVisible(true);
      } catch (error) {
        console.error('Error recording consumption:', error);
        setConsumptionError('Failed to record consumption: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    } catch (error) {
      console.error('Error in handleConsumption:', error);
      setConsumptionError('An unexpected error occurred');
    }
  };

  // Helper function to format dates consistently
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Error formatting date';
    }
  };

  // Helper to check if a date is expiring within 7 days
  const isDateSoonToExpire = (dateString: string): boolean => {
    try {
      const expiryDate = new Date(dateString);
      if (isNaN(expiryDate.getTime())) {
        return false;
      }
      
      const now = new Date();
      const timeDiff = expiryDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      
      // Return true if expiring within 7 days
      return daysDiff >= 0 && daysDiff <= 7;
    } catch (error) {
      console.error('Error checking expiration:', error);
      return false;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color="#4169E1" />
      </View>
    );
  }

  const cartSubtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const cartTax = calculateTax(cartSubtotal);
  const cartServiceCharge = calculateServiceCharge(cartSubtotal);
  const cartDiscount = calculateDiscount(cartSubtotal);
  const cartTotal = cartSubtotal + cartTax + cartServiceCharge - cartDiscount;

  const renderPaymentOptions = () => {
    if (!isSettingsLoaded) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      );
    }

    return (
      <View style={styles.paymentOption}>
        {paymentSettings.enableCash && (
          <TouchableOpacity
            style={[
              styles.paymentOption,
              paymentMethod === 'cash' && styles.selectedPayment
            ]}
            onPress={() => handlePaymentMethodSelect('cash')}
          >
            <FontAwesome 
              name="money" 
              size={24} 
              color={paymentMethod === 'cash' ? '#FFFFFF' : '#4F46E5'} 
            />
            <Text style={[
              styles.paymentText,
              paymentMethod === 'cash' && styles.selectedPaymentText
            ]}>Cash</Text>
          </TouchableOpacity>
        )}

        {paymentSettings.enableGCash && (
          <TouchableOpacity
            style={[
              styles.paymentOption,
              paymentMethod === 'gcash' && styles.selectedPayment
            ]}
            onPress={() => handlePaymentMethodSelect('gcash')}
          >
            <FontAwesome 
              name="credit-card" 
              size={24} 
              color={paymentMethod === 'gcash' ? '#FFFFFF' : '#00a6ce'} 
            />
            <Text style={[
              styles.paymentText,
              paymentMethod === 'gcash' && styles.selectedPaymentText
            ]}>GCash</Text>
          </TouchableOpacity>
        )}

        {paymentSettings.enableMaya && (
          <TouchableOpacity
            style={[
              styles.paymentOption,
              paymentMethod === 'maya' && styles.selectedPayment
            ]}
            onPress={() => handlePaymentMethodSelect('maya')}
          >
            <FontAwesome 
              name="credit-card" 
              size={24} 
              color={paymentMethod === 'maya' ? '#FFFFFF' : '#5cc6c8'} 
            />
            <Text style={[
              styles.paymentText,
              paymentMethod === 'maya' && styles.selectedPaymentText
            ]}>Maya</Text>
          </TouchableOpacity>
        )}

        {paymentSettings.enableGrabPay && (
          <TouchableOpacity
            style={[
              styles.paymentOption,
              paymentMethod === 'grabpay' && styles.selectedPayment
            ]}
            onPress={() => handlePaymentMethodSelect('grabpay')}
          >
            <FontAwesome 
              name="credit-card" 
              size={24} 
              color={paymentMethod === 'grabpay' ? '#FFFFFF' : '#00b14f'} 
            />
            <Text style={[
              styles.paymentText,
              paymentMethod === 'grabpay' && styles.selectedPaymentText
            ]}>GrabPay</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderNotificationModal = () => (
    <Modal
      visible={showNotificationModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowNotificationModal(false)}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
      }}>
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          width: '90%',
          maxWidth: 500,
          maxHeight: '80%',
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 5,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#E5E7EB',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome name="bell" size={20} color="#F36514" style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937' }}>
                Notifications
              </Text>
              {notifications.length > 0 && (
                <View style={{
                  backgroundColor: '#EF4444',
                  borderRadius: 12,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  marginLeft: 8,
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
                    {notifications.length}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setShowNotificationModal(false)}
              style={{ padding: 8 }}
            >
              <FontAwesome name="times" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          {/* Content - ScrollView for both web and native */}
          <ScrollView style={{ maxHeight: 400 }}>
            <View style={{ padding: 16 }}>
              {notifications.length === 0 ? (
                <View style={{ alignItems: 'center', justifyContent: 'center', padding: 30 }}>
                  <FontAwesome name="bell-slash" size={48} color="#D1D5DB" />
                  <Text style={{
                    textAlign: 'center',
                    color: '#1F2937',
                    fontWeight: '600',
                    marginTop: 16,
                    fontSize: 16,
                  }}>
                    No new orders
                  </Text>
                  <Text style={{
                    textAlign: 'center',
                    color: '#6B7280',
                    marginTop: 8,
                    fontSize: 14,
                  }}>
                    New customer orders will appear here
                  </Text>
                </View>
              ) : (
                notifications.map((order) => (
                  <View
                    key={order.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 10,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      overflow: 'hidden',
                    }}
                  >
                    <View style={{ padding: 14 }}>
                      <View style={{ marginBottom: 10 }}>
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}>
                          <Text style={{
                            fontSize: 16,
                            fontWeight: '600',
                            color: '#1F2937',
                          }}>
                            Order #{order.id.slice(-6)}
                          </Text>
                          <View style={{
                            backgroundColor: '#FEF3C7',
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 12,
                          }}>
                            <Text style={{
                              color: '#D97706',
                              fontSize: 12,
                              fontWeight: '500',
                            }}>
                              Paid
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 12, color: '#6B7280' }}>
                          {order.createdAt && typeof order.createdAt.toDate === 'function'
                            ? order.createdAt.toDate().toLocaleString()
                            : new Date().toLocaleString()}
                        </Text>
                      </View>
                      
                      <View style={{ marginBottom: 14 }}>
                        <Text style={{
                          fontSize: 14,
                          color: '#4B5563',
                          fontWeight: '500',
                        }}>
                          {order.customerName || 'Customer Order'}
                        </Text>
                      </View>
                      
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#F36514',
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                        }}
                        onPress={() => {
                          setShowNotificationModal(false);
                          stopNewOrderSound();
                          router.push('/orders');
                        }}
                      >
                        <Text style={{
                          color: '#FFFFFF',
                          fontWeight: '600',
                          fontSize: 14,
                        }}>
                          View Details
                        </Text>
                        <FontAwesome 
                          name="arrow-right" 
                          size={16} 
                          color="#FFFFFF" 
                          style={{ marginLeft: 8 }} 
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderCartSummary = () => {
    const total = cart.reduce((total, item) => total + item.total, 0);
    // Calculate the subtotal as exactly 88% of the total price
    const subtotal = total * 0.88;
    // VAT is exactly 12% of the total
    const tax = total * 0.12;
    const serviceCharge = calculateServiceCharge(subtotal);
    const discount = calculateDiscount(subtotal);
    // The final total remains the same (what customer pays)
    const finalTotal = total + serviceCharge - discount;

    return (
      <>
        {/* Discount controls - moved above order summary and made smaller */}
        <View style={{
          backgroundColor: '#F9FAFB',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}>
          <Text style={{
            fontSize: 16,
            fontWeight: '600',
            color: '#1F2937',
            marginBottom: 12,
          }}>Discounts ({discountPercentage}%)</Text>
          
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginRight: 16,
            }}>
              <Text style={{
                fontSize: 14,
                color: '#4B5563',
                marginRight: 8,
              }}>PWD</Text>
              <TouchableOpacity
                style={[
                  styles.discountSwitch,
                  isPwdDiscount ? styles.discountSwitchActive : {}
                ]}
                onPress={() => {
                  if (!isSeniorDiscount) {
                    setIsPwdDiscount(!isPwdDiscount);
                  } else if (isPwdDiscount) {
                    setIsPwdDiscount(false);
                  } else {
                    Alert.alert('Discount Error', 'Only one discount can be applied at a time.');
                  }
                }}
              >
                <View
                  style={[
                    styles.discountSwitchHandle,
                    isPwdDiscount ? styles.discountSwitchHandleActive : {}
                  ]}
                />
              </TouchableOpacity>
            </View>
            
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 14,
                color: '#4B5563',
                marginRight: 8,
              }}>Senior</Text>
              <TouchableOpacity
                style={[
                  styles.discountSwitch,
                  isSeniorDiscount ? styles.discountSwitchActive : {}
                ]}
                onPress={() => {
                  if (!isPwdDiscount) {
                    setIsSeniorDiscount(!isSeniorDiscount);
                  } else if (isSeniorDiscount) {
                    setIsSeniorDiscount(false);
                  } else {
                    Alert.alert('Discount Error', 'Only one discount can be applied at a time.');
                  }
                }}
              >
                <View
                  style={[
                    styles.discountSwitchHandle,
                    isSeniorDiscount ? styles.discountSwitchHandleActive : {}
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        <View style={styles.cartSummary}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal (net of VAT)</Text>
            <Text style={styles.summaryValue}>₱{subtotal.toFixed(2)}</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>VAT (12%)</Text>
            <Text style={styles.summaryValue}>₱{tax.toFixed(2)}</Text>
          </View>
          
          {/* Show discount in summary if applied */}
          {(isPwdDiscount || isSeniorDiscount) && (
            <View style={styles.summaryRow}>
              <Text style={styles.discountAppliedLabel}>
                {isPwdDiscount ? 'PWD' : 'Senior Citizen'} Discount ({discountPercentage}%)
              </Text>
              <Text style={styles.discountAppliedValue}>-₱{discount.toFixed(2)}</Text>
            </View>
          )}
          
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₱{finalTotal.toFixed(2)}</Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            setSidebarOpen(!sidebarOpen);
            Animated.timing(sidebarAnimation, {
              toValue: sidebarOpen ? -300 : 0,
              duration: 300,
              useNativeDriver: true,
            }).start();
          }}
          style={styles.menuButton}
        >
          <FontAwesome name="bars" size={24} color="#F36514" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.consumptionButton}
          onPress={() => {
            fetchInventoryItems();
            setConsumptionModalVisible(true);
          }}
        >
          <FontAwesome name="clipboard" size={20} color="#FFFFFF" />
          <Text style={styles.consumptionButtonText}>Daily Consumption</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.notificationButton, { marginLeft: 8 }]}
          onPress={() => setShowNotificationModal(true)}
        >
          <FontAwesome name="bell" size={20} color="#F36514" />
          {hasUnreadNotifications && <View style={styles.notificationBadge} />}
        </TouchableOpacity>
      </View>

      {/* Sidebar */}
      <Animated.View style={[
        styles.sidebar,
        {
          transform: [{ translateX: sidebarAnimation }],
        },
      ]}>
        <View style={styles.sidebarHeader}>
          <View style={styles.brandContainer}>
            <Text style={styles.brandName}>Brothers Nook POS</Text>
            <View style={styles.userInfoContainer}>
              <Text style={styles.userEmail}>{authUser?.email}</Text>
              <View style={[
                styles.roleBadge,
                role === 'owner' ? styles.ownerBadge : styles.staffBadge
              ]}>
                <Text style={styles.roleBadgeText}>
                  {role === 'owner' ? 'Owner' : 'Staff'}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={toggleSidebar} style={styles.closeButton}>
            <FontAwesome name="times" size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.sidebarContent}>
          <View style={styles.sidebarSection}>
            
            <Link href="/orders" asChild>
              <TouchableOpacity style={styles.sidebarItem}>
                <View style={styles.iconContainer}>
                  <FontAwesome name="list-alt" size={20} color="#F36514" />
                </View>
                <Text style={styles.sidebarItemText}>Orders</Text>
              </TouchableOpacity>
            </Link>
            
            {role === 'owner' && (
              <Link href="/add-items" asChild>
                <TouchableOpacity style={styles.sidebarItem}>
                  <View style={styles.iconContainer}>
                    <FontAwesome name="plus-circle" size={20} color="#F36514" />
                  </View>
                  <Text style={styles.sidebarItemText}>Items</Text>
                </TouchableOpacity>
              </Link>
            )}

            <Link href="/inventory1" asChild>
              <TouchableOpacity style={styles.sidebarItem}>
                <View style={styles.iconContainer}>
                  <FontAwesome name="list" size={20} color="#F36514" />
                </View>
                <Text style={styles.sidebarItemText}>Inventory</Text>
              </TouchableOpacity>
            </Link>

            <Link href="/dashboard" asChild>
              <TouchableOpacity style={styles.sidebarItem}>
                <View style={styles.iconContainer}>
                  <FontAwesome name="dashboard" size={20} color="#F36514" />
                </View>
                <Text style={styles.sidebarItemText}>Dashboard</Text>
              </TouchableOpacity>
            </Link>

            {role === 'owner' && (
              <Link href="/staff" asChild>
                <TouchableOpacity style={styles.sidebarItem}>
                  <View style={styles.iconContainer}>
                    <FontAwesome name="users" size={20} color="#F36514" />
                  </View>
                  <Text style={styles.sidebarItemText}>Staff</Text>
                </TouchableOpacity>
              </Link>
            )}

            <Link href="/settings" asChild>
              <TouchableOpacity style={styles.sidebarItem}>
                <View style={styles.iconContainer}>
                  <FontAwesome name="gear" size={20} color="#F36514" />
                </View>
                <Text style={styles.sidebarItemText}>Settings</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
        <TouchableOpacity style={styles.logoutItem} onPress={handleLogout}>
          <View style={styles.iconContainer}>
            <FontAwesome name="sign-out" size={20} color="#FF6B6B" />
          </View>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Main Content */}
      <View style={styles.splitContainer}>
        <View style={styles.leftPanel}>
          {/* Search Button */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
              <FontAwesome name="search" size={20} color="#6B7280" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search products..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#6B7280"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearButton}
                >
                  <FontAwesome name="times-circle" size={20} color="#6B7280" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Categories */}
          <View style={styles.categories}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map(category => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryButton,
                    selectedCategory?.id === category.id && styles.selectedCategory
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Text style={[
                    styles.categoryText,
                    selectedCategory?.id === category.id && styles.selectedCategoryText
                  ]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Products Grid */}
          <ScrollView style={styles.productsContainer}>
            <View style={styles.productGrid}>
              {filteredProducts
                .map(product => (
                  <TouchableOpacity
                    key={product.id}
                    style={[
                      styles.productCard,
                      product.status === 'unavailable' && { opacity: 0.5, backgroundColor: '#F3F4F6' }
                    ]}
                    onPress={() => product.status === 'available' && handleProductSelect(product)}
                    disabled={product.status === 'unavailable'}
                  >
                    {product.imageUrl ? (
                      <Image 
                        source={{ uri: product.imageUrl }} 
                        style={styles.productImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.productImage, styles.noImage]}>
                        <Text>No Image</Text>
                      </View>
                    )}
                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                      {!product.hasSizes ? (
                        <Text style={styles.productPrice}>₱{product.basePrice}</Text>
                      ) : (
                        <View style={styles.sizesContainer}>
                          {Object.entries(product.sizes || {}).map(([size, data]) => (
                            <Text key={size} style={styles.sizePrice}>
                              {size}: ₱{data.price}
                            </Text>
                          ))}
                        </View>
                      )}
                      {product.status === 'unavailable' && (
                        <View style={styles.unavailableBadge}>
                          <Text style={styles.unavailableText}>Unavailable</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          </ScrollView>
        </View>

        {/* Cart Panel */}
        <View style={styles.rightPanel}>
          <View style={styles.cartContainer}>
            <View style={styles.cartHeader}>
            
              
            </View>
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <FontAwesome name="list-alt" size={48} color="#9CA3AF" />
                <Text style={styles.emptyCartText}>Order is empty</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.cartItemsContainer}>
                  {cart.map((item, index) => (
                    <View key={`${item.id}-${item.size}-${index}`} style={styles.cartItem}>
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemName}>{item.name}</Text>
                        {item.size && (
                          <Text style={styles.cartItemSize}>{item.size}</Text>
                        )}
                        <Text style={styles.cartItemPrice}>₱{item.price.toFixed(2)}</Text>
                      </View>
                      <View style={styles.quantityContainer}>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => updateQuantity(item.id, item.quantity - 1, item.size)}
                        >
                          <Text>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.quantityText}>x{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => updateQuantity(item.id, item.quantity + 1, item.size)}
                        >
                          <Text>+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => removeFromCart(item.id, item.size)}
                        >
                          <Text style={styles.removeButtonText}>×</Text>
                        </TouchableOpacity>
                        <Text style={styles.cartItemTotal}>Total: ₱{(item.price * item.quantity).toFixed(2)}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                {renderCartSummary()}
                <View style={styles.cartFooter}>
                  <TouchableOpacity 
                    style={styles.checkoutButton}
                    onPress={handleCheckout}
                  >
                    <Text style={styles.checkoutButtonText}>Place Order</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Size Selection Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => {
          setIsModalVisible(false);
          setSelectedProduct(null);
          setSelectedSize('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { width: '50%', maxWidth: 400 }]}>
            <Text style={styles.modalTitle}>Select Size</Text>
            <View style={styles.sizesContainer}>
              {selectedProduct?.sizes && Object.entries(selectedProduct.sizes).map(([size, data]) => (
                <TouchableOpacity
                  key={size}
                  style={[
                    styles.sizeButton,
                    selectedSize === size && styles.selectedSizeButton
                  ]}
                  onPress={() => setSelectedSize(size)}
                >
                  <Text style={[
                    styles.sizeButtonText,
                    selectedSize === size && styles.selectedSizeButtonText
                  ]}>
                    {size}
                  </Text>
                  <Text style={[
                    styles.sizePriceText,
                    selectedSize === size && styles.selectedSizeButtonText
                  ]}>
                    ₱{data.price}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  !selectedSize && styles.disabledButton
                ]}
                disabled={!selectedSize}
                onPress={() => selectedProduct && selectedSize && handleAddToCart(selectedProduct)}
              >
                <Text style={styles.modalButtonText}>Add to Cart</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setIsModalVisible(false);
                  setSelectedProduct(null);
                  setSelectedSize('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Method Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPaymentModal}
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { width: '100%', maxWidth: 700 }]}>
            <Text style={styles.modalTitle}>Select Payment Method</Text>

            <View style={[styles.optionsContainer, { flexWrap: 'nowrap', gap: 8 }]}>
              {paymentSettings.enableCash && (
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: '#4F46E5', width: 150, height: 110, margin: 2 }]}
                  onPress={() => handlePaymentMethodSelect('cash')}
                >
                  <FontAwesome name="money" size={36} color="#FFFFFF" />
                  <Text style={styles.optionText}>Cash</Text>
                </TouchableOpacity>
              )}
              
              {paymentSettings.enableGCash && (
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: '#00a6ce', width: 150, height: 110, margin: 2 }]}
                  onPress={() => handlePaymentMethodSelect('gcash')}
                >
                  <FontAwesome name="credit-card" size={36} color="#FFFFFF" />
                  <Text style={styles.optionText}>GCash</Text>
                </TouchableOpacity>
              )}

              {paymentSettings.enableMaya && (
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: '#5cc6c8', width: 150, height: 110, margin: 2 }]}
                  onPress={() => handlePaymentMethodSelect('maya')}
                >
                  <FontAwesome name="credit-card" size={36} color="#FFFFFF" />
                  <Text style={styles.optionText}>Maya</Text>
                </TouchableOpacity>
              )}

              {paymentSettings.enableGrabPay && (
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: '#00b14f', width: 150, height: 110, margin: 2 }]}
                  onPress={() => handlePaymentMethodSelect('grabpay')}
                >
                  <FontAwesome name="credit-card" size={36} color="#FFFFFF" />
                  <Text style={styles.optionText}>GrabPay</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => {
                setShowPaymentModal(false);
                setCustomerEmail('');
              }}
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dining Mode Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDiningModal}
        onRequestClose={() => setShowDiningModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { width: '40%', maxWidth: 400 }]}>
            <Text style={styles.modalTitle}>Select Dining Mode</Text>
            
            <View style={[styles.optionsContainer, { flexWrap: 'nowrap', gap: 8 }]}>
              <TouchableOpacity
                style={[styles.optionButton, styles.dineInButton, { width: 170, height: 120, margin: 2 }]}
                onPress={() => handleDiningModeSelect('dine-in')}
              >
                <FontAwesome name="cutlery" size={38} color="#FFFFFF" />
                <Text style={styles.optionText}>Dine In</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.optionButton, styles.takeOutButton, { width: 170, height: 120, margin: 2 }]}
                onPress={() => handleDiningModeSelect('takeout')}
              >
                <FontAwesome name="shopping-bag" size={38} color="#FFFFFF" />
                <Text style={styles.optionText}>Take Out</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => {
                setShowDiningModal(false);
                setCustomerEmail('');
              }}
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Daily Consumption Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={consumptionModalVisible}
        onRequestClose={() => setConsumptionModalVisible(false)}
      >
        <View style={styles.modalContainerDC}>
          <View style={styles.modalContentDC}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleDC}>Record Daily Consumption</Text>
              <TouchableOpacity
                style={styles.closeButtonX}
                onPress={() => {
                  setConsumptionModalVisible(false);
                  setSelectedItem(null);
                  setConsumptionAmount('');
                  setConsumptionError(null);
                }}
              >
                <FontAwesome name="times" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            {consumptionError && (
              <View style={{
                flexDirection: 'row', 
                alignItems: 'center',
                marginBottom: 10,
                padding: 12,
                backgroundColor: '#FFEBEE',
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#FFCDD2'
              }}>
                <FontAwesome name="exclamation-circle" size={16} color="#F44336" style={{marginRight: 8}} />
                <Text style={{
                  color: '#D32F2F',
                  fontSize: 14,
                  fontWeight: '500',
                  flex: 1
                }}>{consumptionError}</Text>
              </View>
            )}
            
            {selectedItem ? (
              <>
                <View style={styles.selectedItemContainer}>
                  <Text style={styles.selectedItemText}>
                    Selected: {inventoryItems.find(i => i.id === selectedItem)?.name}
                  </Text>
                  <Text style={styles.stockText}>
                    Current Stock: {inventoryItems.find(i => i.id === selectedItem)?.quantity}
                  </Text>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Enter consumption amount"
                  keyboardType="number-pad"
                  value={consumptionAmount}
                  onChangeText={(text) => {
                    setConsumptionAmount(text);
                    // Clear error message if valid number
                    if (text && !isNaN(parseInt(text)) && parseInt(text) > 0) {
                      setConsumptionError(null);
                    }
                  }}
                />

                {selectedItem && selectedItemExpiries.length > 0 ? (
                  <View style={styles.expiryContainer}>
                    <Text style={styles.expiryTitle}>Select Expiration Date:</Text>
                    <View style={styles.itemButtonsGrid}>
                      {selectedItemExpiries.map((expiry, index) => (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.itemButton,
                            expiry.quantity <= 0 && styles.itemButtonDisabled,
                            selectedExpiryDate === expiry.date && styles.selectedExpiryButton
                          ]}
                          onPress={() => {
                            setSelectedExpiryDate(expiry.date);
                            setConsumptionError(null);
                          }}
                          disabled={expiry.quantity <= 0}
                        >
                          <Text style={[
                            styles.itemButtonText,
                            expiry.quantity <= 0 && styles.itemButtonTextDisabled,
                            selectedExpiryDate === expiry.date && styles.selectedExpiryButtonText
                          ]}>
                            {formatDate(expiry.date)}
                          </Text>
                          <Text style={[
                            styles.itemButtonStock,
                            expiry.quantity <= 0 && styles.itemButtonTextDisabled,
                            selectedExpiryDate === expiry.date && styles.selectedExpiryButtonText
                          ]}>
                            Available Stock: {expiry.quantity}
                          </Text>
                          {isDateSoonToExpire(expiry.date) && (
                            <View style={styles.expiryWarning}>
                              <FontAwesome name="exclamation-triangle" size={12} color="#FF9800" style={{marginRight: 5}} />
                              <Text style={styles.expiryWarningText}>Expiring soon</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : selectedItem ? (
                  <View style={{
                    alignItems: 'center',
                    marginTop: 10,
                    padding: 10,
                    backgroundColor: '#FFE5E5',
                    borderRadius: 5,
                  }}>
                    <FontAwesome name="exclamation-triangle" size={24} color="#F44336" style={{marginBottom: 10}} />
                    <Text style={{
                      fontSize: 14,
                      color: '#FF0000',
                      fontWeight: '500',
                      textAlign: 'center',
                    }}>All batches for this item are expired. Please restock before consumption.</Text>
                  </View>
                ) : null}

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.button, styles.backButtonDC]}
                    onPress={() => {
                      setSelectedItem(null);
                      setConsumptionAmount('');
                      setConsumptionError(null);
                    }}
                  >
                    <Text style={styles.buttonTextDC}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.confirmButtonDC]}
                    onPress={handleConsumption}
                  >
                    <Text style={styles.buttonTextDC}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.selectItemText}>Select an item:</Text>
                <ScrollView style={styles.itemButtonsContainer}>
                  <View style={styles.itemButtonsGrid}>
                    {inventoryItems.map(item => (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.itemButton,
                          item.quantity <= 0 && styles.itemButtonDisabled
                        ]}
                        onPress={() => {
                          setSelectedItem(item.id);
                          setConsumptionError(null);
                        }}
                        disabled={item.quantity <= 0}
                      >
                        <Text style={[
                          styles.itemButtonText,
                          item.quantity <= 0 && styles.itemButtonTextDisabled
                        ]}>
                          {item.name}
                        </Text>
                        <Text style={[
                          styles.itemButtonStock,
                          item.quantity <= 0 && styles.itemButtonTextDisabled
                        ]}>
                          Stock: {item.quantity}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Notification Modal */}
      {renderNotificationModal()}
      
      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { width: '35%', maxWidth: 400 }]}>
            <View style={{ marginBottom: 20, alignItems: 'center' }}>
              <FontAwesome name="check-circle" size={60} color="#10B981" />
            </View>
            <Text style={[styles.modalTitle, { marginBottom: 12 }]}>Order Successfully Created!</Text>
            <TouchableOpacity
              style={[styles.modalButton, styles.confirmButton]}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.modalButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={consumptionSuccessVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setConsumptionSuccessVisible(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 24,
            width: '40%',
            maxWidth: 400,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: {
              width: 0,
              height: 2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
          }}>
            <View style={{ marginBottom: 20 }}>
              <FontAwesome name="check-circle" size={60} color="#4CAF50" />
            </View>
            <Text style={{
              fontSize: 22,
              fontWeight: '700',
              color: '#333',
              textAlign: 'center',
              marginBottom: 16
            }}>Consumption Successfully Processed</Text>
            <Text style={{
              fontSize: 16,
              color: '#666',
              textAlign: 'center',
              marginBottom: 24
            }}>Your daily consumption has been recorded.</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F36514',
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: 8,
                width: '100%',
              }}
              onPress={() => setConsumptionSuccessVisible(false)}
            >
              <Text style={{
                color: 'white',
                fontSize: 16,
                fontWeight: '600',
                textAlign: 'center'
              }}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  expiryContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5
  },
  expiryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10
  },
  selectedExpiryButton: {
    backgroundColor: '#fc6f28'
  },
  selectedExpiryButtonText: {
    color: '#FFFFFF' 
  },
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 10,
  },
  rightPanel: {
    width: '35%',
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E7EB',
  },
  categories: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  selectedCategory: {
    backgroundColor: '#F36514',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  selectedCategoryText: {
    color: '#FFFFFF',
  },
  productsContainer: {
    flex: 1,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  productCard: {
    width: '23%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    position: 'relative',
    minHeight: 200
  },
  productImage: {
    width: '100%',
    height: 100,
    borderRadius: 6,
    marginBottom: 8,
  },
  noImage: {
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  sizesContainer: {
    width: '100%',
    marginBottom: 24,
  },
  sizePrice: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '500',
    lineHeight: 18,
  },
  cartContainer: {
    flex: 1,
  },
  cartHeader: {
    padding: 1,
    borderBottomWidth: 0,
    borderBottomColor: '#E5E7EB',
  },
  cartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  cartItemsContainer: {
    flex: 1,
  },
  cartItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  cartItemInfo: {
    marginBottom: 8,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  cartItemSize: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  cartItemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
    marginTop: 4,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  quantityButton: {
    backgroundColor: '#F3F4F6',
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    minWidth: 24,
    textAlign: 'center',
  },
  removeButton: {
    padding: 4,
    marginLeft: 4,
    borderRadius: 4,
    backgroundColor: '#FEE2E2',
  },
  removeButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    flex: 1,
    marginLeft: 5,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
    textAlign: 'right',
  },
  cartFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cartSummary: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginTop: 1,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#4B5563',
  },
  summaryValue: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  discountContainer: {
    marginTop: 1,
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginHorizontal: 12,
  },
  discountTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  discountSwitchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  discountLabel: {
    fontSize: 10,
    color: '#4B5563',
    marginRight: 8,
  },
  discountSwitch: {
    width: 32,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D1D5DB',
    padding: 2,
  },
  discountSwitchActive: {
    backgroundColor: '#10B981',
  },
  discountSwitchHandle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  discountSwitchHandleActive: {
    transform: [{ translateX: 14 }],
  },
  discountAppliedLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10B981',
  },
  discountAppliedValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  checkoutButton: {
    backgroundColor: '#F36514',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyCartText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  unavailableBadge: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center'
  },
  unavailableText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500'
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    backgroundColor: '#FFFFFF',
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  brandContainer: {
    flex: 1,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#6B7280',
  },
  closeButton: {
    padding: 8,
  },
  sidebarContent: {
    flex: 1,
  },
  sidebarSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingLeft: 12,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EBF5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sidebarItemText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  logoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 600,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
    color: '#1F2937',
  },
  modalButton: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'column',
    width: '100%',
    gap: 12,
    marginTop: 16,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginBottom: 24,
    width: '100%',
  },
  optionButton: {
    width: 180,
    height: 120,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    margin: 0,
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 10,
  },
  cashButton: {
    backgroundColor: '#059669',
  },
  gcashButton: {
    backgroundColor: '#3B82F6',
  },
  dineInButton: {
    backgroundColor: '#3B82F6',
  },
  takeOutButton: {
    backgroundColor: '#10B981',
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  confirmButton: {
    backgroundColor: '#F36514',
  },
  disabledButton: {
    opacity: 0.5,
  },
  sizeButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedSizeButton: {
    backgroundColor: '#fcdbd7',
    borderColor: '#f57262',
  },
  sizeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  sizePriceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#059669',
  },
  selectedSizeButtonText: {
    color: '#F36514',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  emailInput: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#F9FAFB',
    fontSize: 16,
  },
  modalContent: {
    padding: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    width: '100%',
  },
  diningButton: {
    flex: 1,
    height: 120,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#3B82F6',
  },
  cancelButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuButton: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  searchContainer: {
    padding: 5,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    height: '100%',
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  paymentText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 12,
  },
  selectedPayment: {
    backgroundColor: '#EBF5FF',
    borderColor: '#3B82F6',
  },
  selectedPaymentText: {
    color: '#3B82F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  consumptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F36514',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  consumptionButtonText: {
    color: '#FFFFFF',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 16,
  },
  modalContainerDC: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContentDC: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '90%',
  },
  modalTitleDC: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  selectItemText: {
    fontSize: 16,
    marginBottom: 12,
    color: '#666',
  },
  itemButtonsContainer: {
    maxHeight: 400,
  },
  itemButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 20,
  },
  itemButton: {
    backgroundColor: '#fcdbd7',
    borderRadius: 8,
    padding: 12,
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff864a',
  },
  itemButtonDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  itemButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#545454',
    marginBottom: 4,
  },
  itemButtonStock: {
    fontSize: 14,
    color: '#545454',
  },
  itemButtonTextDisabled: {
    color: '#9E9E9E',
  },
  selectedItemContainer: {
    backgroundColor: '#fcdbd7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  selectedItemText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#545454',
    marginBottom: 8,
  },
  stockText: {
    fontSize: 16,
    color: '#545454',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonDC: {
    backgroundColor: '#666',
    marginRight: 8,
  },
  confirmButtonDC: {
    backgroundColor: '#fc6f28',
    marginLeft: 8,
  },
  buttonTextDC: {
    color: 'white',
    fontWeight: '500',
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginVertical: 8,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    color: '#1F2937',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButtonX: {
    padding: 8,
  },
  backButtonDC: {
    backgroundColor: '#666',
    marginRight: 8,
  },
  notificationButton: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  notificationModalWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  notificationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  notificationModalContent: {
    padding: 16,
    maxHeight: 400,
  },
  notificationTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationTitleIcon: {
    marginRight: 8,
  },
  notificationModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  notificationCountBadge: {
    backgroundColor: '#F36514',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 10,
  },
  notificationCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  notificationCloseButton: {
    padding: 8,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 12, // Increased from 10
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  notificationCardContent: {
    padding: 14, // Increased from 12
  },
  notificationCardHeader: {
    marginBottom: 10, // Increased from 8
  },
  orderSummary: {
    marginBottom: 14, // Increased from 12
  },
  emptyNotificationsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30, // Reduced from 40
  },
  noNotificationsText: {
    textAlign: 'center',
    color: '#1F2937',
    fontWeight: '600',
    marginTop: 16,
    fontSize: 16,
  },
  noNotificationsSubtext: {
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 8,
    fontSize: 14,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  ownerBadge: {
    backgroundColor: '#F36514',
  },
  staffBadge: {
    backgroundColor: '#10B981',
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  orderSummaryText: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '40%',
    maxWidth: 450,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
    color: '#1F2937',
  },
  successModalOrderId: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: '#4B5563',
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  successModalMessage: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  successModalButton: {
    backgroundColor: '#F36514',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  successModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Add specific modal containers for different purposes
  sizeSelectionModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '50%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  
  diningModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '40%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  
  paymentModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '60%',
    maxWidth: 550,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  expiredBatchWarning: {
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FFE5E5',
    borderRadius: 5,
  },
  expiredBatchText: {
    fontSize: 14,
    color: '#FF0000',
    fontWeight: '500',
    textAlign: 'center',
  },
  expiredIcon: {
    marginRight: 10,
  },
  expiryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    padding: 5,
    backgroundColor: '#FFF9C4',
    borderRadius: 4,
  },
  expiryWarningText: {
    fontSize: 12,
    color: '#FFA000',
    fontWeight: '500',
  },
  errorContainerDC: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 5,
    backgroundColor: '#FFE5E5',
    borderRadius: 5,
  },
  errorTextDC: {
    color: '#FF0000',
    fontSize: 14,
    fontWeight: '500',
  },
  tabletModalContent: {
    width: '80%',
    maxWidth: 500,
    maxHeight: '80%',
  },
});
