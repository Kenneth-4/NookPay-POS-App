import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Modal, TextInput, Animated, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { auth, db, storage } from '../firebaseConfig';
import { useUser } from './contexts/UserContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// Import ViewShot last, as sometimes order matters for Expo module resolution
import ViewShot from 'react-native-view-shot';

// Import pdfmake for PDF generation
// We only import in web environment to avoid errors on native platforms
const pdfmake = Platform.OS === 'web' ? require('pdfmake/build/pdfmake') : null;
const pdfFonts = Platform.OS === 'web' ? require('pdfmake/build/vfs_fonts') : null;

// Initialize pdfmake with fonts
if (Platform.OS === 'web' && pdfmake && pdfFonts) {
  // The correct property path is pdfFonts.pdfMake.vfs
  pdfmake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  size?: string | null;
  total: number;
}

interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded' | 'ready for pickup';
  timestamp: any;
  customerName: string;
  customerId: string;
  staffId: string;
  staffEmail: string;
  staffName?: string;
  paymentMethod: 'cash' | 'gcash';
  diningMode: 'dine-in' | 'takeout';
  source: 'pos' | 'customer';
  paymentStatus?: 'paid' | 'unpaid' | 'expired';
  paymentId?: string;
  checkoutSessionId?: string;
  paymentExpiryTime?: any;
  createdAt?: any;
  completedAt?: any;
  processingStartTime?: any;
  readyTime?: any;
  refundedAt?: any;
  refundReason?: string;
  total: number;
  subtotal?: number;
  tax?: {
    amount: number;
    percentage: number;
    label: string;
  };
  serviceCharge?: {
    amount: number;
    percentage: number;
  };
  discount?: {
    amount: number;
    percentage: number;
    type: string;
  };
  voucher?: {
    code: string;
    description?: string;
    discountAmount: number;
    percentage: number;
  };
}

interface CustomerPoints {
  id: string;
  email: string;
  name: string;
  points: number;
  lastRedeemed?: any;
}

export default function Orders() {
  const { user: authUser, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false); // New state for loading more indicator
  const [orders, setOrders] = useState<Order[]>([]);
  const [displayedOrders, setDisplayedOrders] = useState<Order[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const ordersPerPage = 9; // 9 orders per page (3x3 grid)
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [customerPoints, setCustomerPoints] = useState<CustomerPoints[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searchOrderCode, setSearchOrderCode] = useState('');
  const [pointsThreshold, setPointsThreshold] = useState(100); // Default value
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [filterByDate, setFilterByDate] = useState(false);
  const [pendingCustomerOrders, setPendingCustomerOrders] = useState<Order[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerPoints | null>(null);
  // Add state for receipt preview modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const itemsToShowCollapsed = 2; // Number of items to show when collapsed
  
  // Receipt download states and ref
  const receiptRef = useRef<ViewShot>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    // Load points threshold from settings
    const loadPointsThreshold = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'config');
        const settingsDoc = await getDoc(settingsRef);
        if (settingsDoc.exists() && settingsDoc.data().rewards?.pointsThreshold) {
          setPointsThreshold(settingsDoc.data().rewards.pointsThreshold);
        }
      } catch (error) {
        console.error('Error loading points threshold:', error);
      }
    };
    
    loadPointsThreshold();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }

      // Subscribe to orders
      const ordersRef = collection(db, 'orders');
      const q = query(
        ordersRef,
        orderBy('createdAt', 'desc')
      );

      const ordersUnsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedOrders = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Safely handle timestamps
            createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : new Date()) : new Date(),
            completedAt: data.completedAt ? (typeof data.completedAt.toDate === 'function' ? data.completedAt.toDate() : null) : null,
            processingStartTime: data.processingStartTime ? (typeof data.processingStartTime.toDate === 'function' ? data.processingStartTime.toDate() : null) : null,
            readyTime: data.readyTime ? (typeof data.readyTime.toDate === 'function' ? data.readyTime.toDate() : null) : null,
            refundedAt: data.refundedAt ? (typeof data.refundedAt.toDate === 'function' ? data.refundedAt.toDate() : null) : null
          };
        }) as Order[];
        
        // Filter out orders with paymentStatus 'unpaid' 
        const filteredOrders = fetchedOrders.filter(order => 
          // Keep all POS orders
          order.source === 'pos' || 
          // For customer orders, only keep those that aren't unpaid
          (order.source === 'customer' && order.paymentStatus !== 'unpaid')
        );
        
        // Sort on client side
        filteredOrders.sort((a, b) => {
          const timestampA = a.createdAt || new Date(0);
          const timestampB = b.createdAt || new Date(0);
          return timestampB.getTime() - timestampA.getTime();
        });
        
        setOrders(filteredOrders);
        
        // Check for pending orders from customer app
        // Only consider paid customer orders that are pending as "new orders"
        const pendingCustomerOrders = fetchedOrders.filter(
          order => order.source === 'customer' && 
                  order.status === 'pending' && 
                  order.paymentStatus === 'paid'
        );
        
        setPendingCustomerOrders(pendingCustomerOrders);
        setLoading(false);
      }, 
      (error) => {
        console.error('Error fetching orders:', error);
        setLoading(false);
      });

      // Subscribe to users collection for points
      const usersRef = collection(db, 'users');
      const pointsUnsubscribe = onSnapshot(usersRef, (snapshot) => {
        const fetchedPoints = snapshot.docs.map(doc => ({
          id: doc.id,
          email: doc.data().email,
          name: doc.data().name,
          points: doc.data().points || 0,
          lastRedeemed: doc.data().lastRedeemed ? doc.data().lastRedeemed.toDate() : null
        })).filter(user => user.points > 0) as CustomerPoints[];
        setCustomerPoints(fetchedPoints);
      }, (error) => {
        console.error('Error fetching customer points:', error);
        Alert.alert('Error', 'Failed to fetch customer points');
      });

      // Subscribe to settings for points threshold updates
      const settingsRef = doc(db, 'settings', 'config');
      const settingsUnsubscribe = onSnapshot(settingsRef, (doc) => {
        if (doc.exists() && doc.data().rewards?.pointsThreshold) {
          setPointsThreshold(doc.data().rewards.pointsThreshold);
        }
      });

      return () => {
        ordersUnsubscribe();
        pointsUnsubscribe();
        settingsUnsubscribe();
      };
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Set up pulsing animation for the new order alert
    if (pendingCustomerOrders.length > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pendingCustomerOrders.length, pulseAnim]);

  const handleStatusChange = async (orderId: string, newStatus: Order['status']) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const currentUser = auth.currentUser;
      
      // Get user role and name from Firestore
      const userDoc = await getDoc(doc(db, 'users', currentUser?.uid || ''));
      const userData = userDoc.exists() ? userDoc.data() : null;
      const userRole = userData?.role || null;
      const staffName = userData?.name || 'Unknown Staff';
      const isOwner = userRole === 'owner';
      
      const staffInfo = {
        staffId: currentUser?.uid || 'unknown',
        staffName: isOwner ? `${staffName}` : staffName,
        staffEmail: currentUser?.email || 'No Email'
      };
      
      // If changing to "Processing", record the processing start time
      if (newStatus === 'processing') {
        await updateDoc(orderRef, {
          status: newStatus,
          processingStartTime: serverTimestamp(),
          ...staffInfo
        });
      } 
      // If changing to "Ready for Pickup", record the ready time
      else if (newStatus === 'ready for pickup') {
        await updateDoc(orderRef, {
          status: newStatus,
          readyTime: serverTimestamp(),
          ...staffInfo
        });
      }
      // If changing to "Completed", record the completed time
      else if (newStatus === 'completed') {
        await updateDoc(orderRef, {
          status: newStatus,
          completedAt: serverTimestamp(),
          ...staffInfo
        });
      }
      // For other status changes
      else {
        await updateDoc(orderRef, {
          status: newStatus,
          ...staffInfo
        });
      }

      // Update local state for both orders and displayedOrders arrays
      // without triggering a full pagination reset
      const updatedOrders = orders.map(o => 
        o.id === orderId 
          ? { ...o, status: newStatus, ...staffInfo }
          : o
      );
      setOrders(updatedOrders);
      
      // Also update the displayed orders directly
      const updatedDisplayedOrders = displayedOrders.map(o => 
        o.id === orderId 
          ? { ...o, status: newStatus, ...staffInfo }
          : o
      );
      setDisplayedOrders(updatedDisplayedOrders);

      // Show success message
      Alert.alert('Success', `Order status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating order status:', error);
      Alert.alert('Error', 'Failed to update order status');
    }
  };

  const handleRefund = async () => {
    if (!selectedOrder) return;
    
    if (!refundReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for the refund');
      return;
    }

    if (userLoading) {
      Alert.alert('Error', 'Please wait while user data is loading');
      return;
    }

    if (!authUser) {
      Alert.alert('Error', 'You must be logged in to perform this action');
      return;
    }

    try {
      // Get the staff name from users collection
      const userDoc = await getDoc(doc(db, 'users', authUser.uid));
      const staffName = userDoc.exists() ? userDoc.data().name : 'Unknown Staff';
      const userRole = userDoc.exists() ? userDoc.data().role : null;
      const isOwner = userRole === 'owner';
      
      const orderRef = doc(db, 'orders', selectedOrder.id);
      const staffInfo = {
        staffId: authUser.uid || 'unknown',
        staffName: isOwner ? `${staffName}` : staffName,
        staffEmail: authUser.email || 'No Email'
      };
      
      await updateDoc(orderRef, {
        status: 'refunded',
        refundedAt: serverTimestamp(),
        refundReason: refundReason.trim(),
        ...staffInfo
      });

      // Update local state
      setOrders(orders.map(o => 
        o.id === selectedOrder.id 
          ? { 
              ...o, 
              status: 'refunded', 
              refundedAt: new Date(),
              refundReason: refundReason.trim(),
              ...staffInfo 
            }
          : o
      ));

      // Reset state and close modal
      setRefundReason('');
      setSelectedOrder(null);
      setShowOrderModal(false);

      // Show success message
      Alert.alert('Success', 'Order has been refunded successfully');
    } catch (error) {
      console.error('Error refunding order:', error);
      Alert.alert('Error', 'Failed to refund order');
    }
  };

  const handleRedeemPoints = async (customerId: string, currentPoints: number) => {
    try {
      // Use the current pointsThreshold value from state instead of fetching it again
      const pointsToRedeem = Math.floor(currentPoints / pointsThreshold) * pointsThreshold;
      const remainingPoints = currentPoints % pointsThreshold;

      const userRef = doc(db, 'users', customerId);
      await updateDoc(userRef, {
        points: remainingPoints,
        lastRedeemed: serverTimestamp()
      });
      Alert.alert('Success', `${pointsToRedeem} points redeemed successfully! Remaining points: ${remainingPoints}`);
    } catch (error) {
      console.error('Error redeeming points:', error);
      Alert.alert('Error', 'Failed to redeem points');
    }
  };

  const handleDeleteCustomerPoints = async (customerId: string, customerName: string) => {
    // For mobile platforms, use Alert
    if (Platform.OS !== 'web') {
      Alert.alert(
        "Delete Points",
        `Are you sure you want to delete all points for ${customerName}?`,
        [
          {
            text: "Cancel",
            style: "cancel"
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const userRef = doc(db, 'users', customerId);
                await updateDoc(userRef, {
                  points: 0,
                  lastRedeemed: serverTimestamp()
                });
                Alert.alert('Success', `Points deleted successfully for ${customerName}`);
              } catch (error) {
                console.error('Error deleting points:', error);
                Alert.alert('Error', 'Failed to delete points');
              }
            }
          }
        ]
      );
    } else {
      // For web platform, use the modal
      const customer = customerPoints.find(c => c.id === customerId);
      if (customer) {
        setCustomerToDelete(customer);
        setShowDeleteModal(true);
      }
    }
  };

  // Function to capture receipt as image
  const captureReceipt = async (): Promise<string | null> => {
    if (!receiptRef.current) {
      console.error('Receipt reference not found');
      return null;
    }

    try {
      // Explicitly check if capture method exists
      if (typeof receiptRef.current.capture !== 'function') {
        console.error('ViewShot capture method not found');
        return null;
      }
      
      // Capture the component as an image
      const uri = await receiptRef.current.capture();
      return uri;
    } catch (error) {
      console.error('Error capturing receipt:', error);
      Alert.alert('Error', 'Failed to capture receipt');
      return null;
    }
  };

  // Function to download receipt as image
  const downloadReceiptAsImage = async () => {
    if (!selectedOrder) return;
    
    setDownloadingImage(true);
    try {
      const uri = await captureReceipt();
      if (!uri) {
        setDownloadingImage(false);
        return;
      }

      // For web platform, create a download link
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `receipt-${selectedOrder.id.slice(-6)}.png`;
        link.click();
        URL.revokeObjectURL(url);
        
        Alert.alert('Success', 'Receipt image downloaded successfully');
      } else {
        // For mobile platforms, upload to Firebase and provide a link
        await uploadAndShareReceipt(uri, 'image');
      }
    } catch (error) {
      console.error('Error downloading receipt as image:', error);
      Alert.alert('Error', 'Failed to download receipt');
    } finally {
      setDownloadingImage(false);
    }
  };

  // Function to upload receipt image to Firebase and generate PDF URL
  const downloadReceiptAsPDF = async () => {
    if (!selectedOrder) return;
    
    setDownloadingPDF(true);
    try {
      // For web platform, use pdfmake to generate a PDF file directly
      if (Platform.OS === 'web') {
        if (!pdfmake) {
          Alert.alert('Error', 'PDF generation library not available');
          setDownloadingPDF(false);
          return;
        }
        
        // Generate PDF document definition
        const docDefinition = generatePDFContent(selectedOrder);
        
        // Create and download the PDF
        const pdfDoc = pdfmake.createPdf(docDefinition);
        pdfDoc.download(`Brothers_Nook_Receipt_${selectedOrder.id.slice(-6)}.pdf`);
        
        // Alert success after a short delay
        setTimeout(() => {
          setDownloadingPDF(false);
          Alert.alert('Success', 'Receipt has been downloaded as a PDF file.');
        }, 1000);
        
        return;
      }
      
      // For mobile, capture receipt as image then upload to Firebase
      const uri = await captureReceipt();
      if (!uri) {
        setDownloadingPDF(false);
        return;
      }

      await uploadAndShareReceipt(uri, 'pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
      Alert.alert('Error', 'Failed to generate PDF');
      setDownloadingPDF(false);
    }
  };
  
  // Function to generate a PDF document definition for pdfmake
  const generatePDFContent = (order: Order) => {
    // Format currency
    const formatCurrency = (amount: number) => `₱${amount.toFixed(2)}`;
    
    // Define types for table cells to allow for pdfmake properties
    type TableCell = {
      text?: string;
      style?: string;
      alignment?: string;
      colSpan?: number;
      rowSpan?: number;
      border?: boolean[];
      color?: string;
      bold?: boolean;
      italics?: boolean;
      fontSize?: number;
      [key: string]: any; // Allow any other properties that pdfmake supports
    };
    
    // Generate items table
    const itemsBody: (string | TableCell)[][] = [
      [
        { text: 'Item', style: 'tableHeader' },
        { text: 'Qty', style: 'tableHeader', alignment: 'center' },
        { text: 'Price', style: 'tableHeader', alignment: 'right' }
      ],
      ...order.items.map(item => [
        item.name + (item.size ? ` (${item.size})` : ''),
        { text: item.quantity.toString(), alignment: 'center' } as TableCell,
        { text: formatCurrency(item.total), alignment: 'right' } as TableCell
      ])
    ];
    
    // Check for discounts, vouchers, tax, etc.
    const hasSubtotal = order.subtotal !== undefined;
    const hasDiscount = order.discount && order.discount.amount > 0;
    const hasVoucher = order.voucher && order.voucher.discountAmount > 0;
    const hasTax = order.tax && order.tax.amount > 0;
    const hasServiceCharge = order.serviceCharge && order.serviceCharge.amount > 0;
    
    // Add summary rows
    if (hasSubtotal) {
      itemsBody.push([
        { text: 'Subtotal:', colSpan: 2, alignment: 'right', border: [false, false, false, false] } as TableCell,
        {} as TableCell, // Empty cell for colSpan
        { text: formatCurrency(order.subtotal!), alignment: 'right', border: [false, false, false, false] } as TableCell
      ]);
    }
    
    if (hasDiscount) {
      itemsBody.push([
        { 
          text: `${order.discount!.type} (${order.discount!.percentage}%):`, 
          colSpan: 2, 
          alignment: 'right', 
          color: '#10B981',
          border: [false, false, false, false]
        } as TableCell,
        {} as TableCell, // Empty cell for colSpan
        { 
          text: `-${formatCurrency(order.discount!.amount)}`, 
          alignment: 'right', 
          color: '#10B981',
          border: [false, false, false, false]
        } as TableCell
      ]);
    }
    
    if (hasVoucher) {
      itemsBody.push([
        { 
          text: `Voucher ${order.voucher!.code}:`, 
          colSpan: 2, 
          alignment: 'right', 
          color: '#8B5CF6',
          border: [false, false, false, false]
        } as TableCell,
        {} as TableCell, // Empty cell for colSpan
        { 
          text: `-${formatCurrency(order.voucher!.discountAmount)}`, 
          alignment: 'right', 
          color: '#8B5CF6',
          border: [false, false, false, false]
        } as TableCell
      ]);
    }
    
    if (hasTax) {
      itemsBody.push([
        { 
          text: `${order.tax!.label || 'VAT'} (${order.tax!.percentage}%):`, 
          colSpan: 2, 
          alignment: 'right', 
          border: [false, false, false, false]
        } as TableCell,
        {} as TableCell, // Empty cell for colSpan
        { 
          text: formatCurrency(order.tax!.amount), 
          alignment: 'right', 
          border: [false, false, false, false]
        } as TableCell
      ]);
    }
    
    if (hasServiceCharge) {
      itemsBody.push([
        { 
          text: `Service Charge (${order.serviceCharge!.percentage}%):`, 
          colSpan: 2, 
          alignment: 'right', 
          border: [false, false, false, false]
        } as TableCell,
        {} as TableCell, // Empty cell for colSpan
        { 
          text: formatCurrency(order.serviceCharge!.amount), 
          alignment: 'right', 
          border: [false, false, false, false]
        } as TableCell
      ]);
    }
    
    // Add total row
    itemsBody.push([
      { 
        text: 'Total:', 
        colSpan: 2, 
        alignment: 'right', 
        bold: true,
        border: [false, true, false, false]
      } as TableCell,
      {} as TableCell, // Empty cell for colSpan
      { 
        text: formatCurrency(order.total), 
        alignment: 'right', 
        bold: true,
        border: [false, true, false, false]
      } as TableCell
    ]);
    
    // Format dates
    const orderDate = order.createdAt instanceof Date 
      ? order.createdAt.toLocaleString() 
      : new Date().toLocaleString();
    
    // Create refund section if applicable
    const refundSection: TableCell[] = [];
    if (order.status === 'refunded' && order.refundedAt) {
      const refundDate = order.refundedAt instanceof Date 
        ? order.refundedAt.toLocaleString() 
        : new Date().toLocaleString();
        
      refundSection.push(
        { text: 'REFUNDED', style: 'refundHeader' } as TableCell,
        { text: `Refund Date: ${refundDate}`, style: 'refundText' } as TableCell,
        { text: `Reason: ${order.refundReason || 'No reason provided'}`, style: 'refundText', italics: true } as TableCell
      );
    }
    
    // Define content item type
    type ContentItem = {
      text?: string;
      style?: string;
      margin?: number[];
      stack?: any[];
      table?: {
        headerRows?: number;
        widths?: any[];
        body: any[][];
      };
      layout?: string;
      [key: string]: any;
    };
    
    // Return the complete document definition
    return {
      content: [
        // Header
        { text: 'Brothers\' Nook', style: 'header' },
        { text: 'Receipt', style: 'subheader' },
        { text: `Order #${order.id.slice(-6)}`, style: 'orderId' },
        { text: orderDate, style: 'date', margin: [0, 0, 0, 20] },
        
        // Customer Information
        { text: 'Customer Information', style: 'sectionHeader' },
        {
          layout: 'noBorders',
          table: {
            widths: ['auto', '*'],
            body: [
              ['Name:', order.customerName],
              ['Payment Method:', order.paymentMethod],
              ['Dining Mode:', order.diningMode]
            ]
          },
          margin: [0, 0, 0, 20]
        } as ContentItem,
        
        // Order Items
        { text: 'Order Items', style: 'sectionHeader' },
        {
          table: {
            headerRows: 1,
            widths: ['*', 50, 80],
            body: itemsBody
          },
          margin: [0, 0, 0, 20]
        } as ContentItem,
        
        // Refund Section (if applicable)
        refundSection.length > 0 ? {
          style: 'refundSection',
          stack: refundSection
        } as ContentItem : null,
        
        // Footer
        { text: 'Thank you for your order!', style: 'thankYou', margin: [0, 20, 0, 5] },
        { text: `Served by: ${order.staffName ? `${order.staffName} (${order.staffEmail})` : order.staffEmail}`, style: 'staffInfo' }
      ],
      
      styles: {
        header: {
          fontSize: 22,
          bold: true,
          alignment: 'center',
          color: '#1F2937'
        },
        subheader: {
          fontSize: 16,
          alignment: 'center',
          color: '#4B5563',
          margin: [0, 5, 0, 0]
        },
        orderId: {
          fontSize: 18,
          bold: true,
          alignment: 'center',
          color: '#F36514',
          margin: [0, 10, 0, 5]
        },
        date: {
          fontSize: 12,
          alignment: 'center',
          color: '#6B7280'
        },
        sectionHeader: {
          fontSize: 14,
          bold: true,
          margin: [0, 10, 0, 10],
          color: '#374151',
          decoration: 'underline'
        },
        tableHeader: {
          bold: true,
          fontSize: 12,
          color: '#374151'
        },
        refundSection: {
          background: '#F9F1FF',
          margin: [0, 20, 0, 20],
          padding: 10,
          borderRadius: 5,
          borderColor: '#9333EA',
          borderWidth: 1,
          alignment: 'center'
        },
        refundHeader: {
          fontSize: 16,
          bold: true,
          color: '#9333EA',
          alignment: 'center',
          margin: [0, 0, 0, 10]
        },
        refundText: {
          fontSize: 12,
          color: '#6B7280',
          alignment: 'center',
          margin: [0, 0, 0, 5]
        },
        thankYou: {
          fontSize: 14,
          bold: true,
          alignment: 'center',
          color: '#F36514'
        },
        staffInfo: {
          fontSize: 10,
          alignment: 'center',
          color: '#6B7280'
        }
      },
      
      defaultStyle: {
        fontSize: 10,
        color: '#1F2937'
      }
    };
  };

  // Helper function to upload to Firebase and share via URL
  const uploadAndShareReceipt = async (uri: string, type: 'image' | 'pdf') => {
    try {
      // Convert image to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload image to Firebase Storage
      const orderCode = selectedOrder?.id.slice(-6);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Use PNG for the image but add appropriate metadata for PDFs
      const extension = 'png';
      const fileName = `receipts/${orderCode}-${timestamp}${type === 'pdf' ? '-pdf' : ''}.${extension}`;
      const storageRef = ref(storage, fileName);
      
      // Add appropriate content type in metadata
      const metadata = {
        contentType: type === 'pdf' ? 'application/pdf' : 'image/png',
        customMetadata: {
          'fileName': type === 'pdf' 
            ? `Brothers_Nook_Receipt_${orderCode}.pdf` 
            : `Brothers_Nook_Receipt_${orderCode}.png`,
          'orderID': selectedOrder?.id || '',
          'timestamp': timestamp,
          'type': type
        }
      };
      
      await uploadBytes(storageRef, blob, metadata);
      
      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);
      setReceiptUrl(downloadURL);
      
      // Alert with link
      Alert.alert(
        type === 'pdf' ? 'PDF Receipt Available' : 'Receipt Image Available',
        type === 'pdf' 
          ? 'Your PDF receipt is ready to view. Tap the button below to open it.'
          : 'Your receipt image is ready to view. Tap the button below to open it.',
        [
          { text: 'Cancel' },
          { 
            text: `Open ${type === 'pdf' ? 'PDF Receipt' : 'Receipt Image'}`, 
            onPress: () => {
              Linking.openURL(downloadURL).catch(() => {
                Alert.alert('Error', 'Could not open URL');
              });
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error uploading receipt:', error);
      Alert.alert('Error', `Failed to generate receipt ${type === 'pdf' ? 'PDF' : 'image'}`);
    }
  };

  const confirmDeletePoints = async () => {
    if (!customerToDelete) return;
    
    try {
      const userRef = doc(db, 'users', customerToDelete.id);
      await updateDoc(userRef, {
        points: 0,
        lastRedeemed: serverTimestamp()
      });
      
      // Close the modal first
      setShowDeleteModal(false);
      setCustomerToDelete(null);
      
      // Show success alert
      Alert.alert('Success', `Points deleted successfully for ${customerToDelete.name}`);
    } catch (error) {
      console.error('Error deleting points:', error);
      Alert.alert('Error', 'Failed to delete points');
      setShowDeleteModal(false);
      setCustomerToDelete(null);
    }
  };

  // Helper function to get color for order status
  const getOrderStatusColor = (status: string, source: string) => {
    // Check for refunded status first regardless of source
    if (status === 'refunded') {
      return '#9333EA'; // Purple for refunded orders
    }
    
    // POS orders that aren't refunded are always completed
    if (source === 'pos') {
      return '#10B981'; // Green color for completed
    }

    switch (status) {
      case 'completed':
        return '#10B981'; // Green
      case 'processing':
        return '#3B82F6'; // Blue
      case 'ready for pickup':
        return '#F59E0B'; // Yellow
      case 'cancelled':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray for pending
    }
  };

  // Add a toggle function for expanding/collapsing order cards
  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  const renderOrderCard = (order: Order) => {
    const showStatusButtons = order.source === 'customer';
    const isPendingCustomerOrder = order.source === 'customer' && order.status === 'pending';
    const hasDiscount = order.discount && order.discount.amount > 0;
    const hasVoucher = order.voucher && order.voucher.discountAmount > 0;
    const isExpanded = expandedOrders.includes(order.id);
    const hasMoreItems = order.items.length > itemsToShowCollapsed;
    
    // Items to display based on expansion state
    const displayedItems = isExpanded || !hasMoreItems 
      ? order.items 
      : order.items.slice(0, itemsToShowCollapsed);
    
    // Calculate total with and without discount to detect implicit discounts
    const calculatedTotal = (order.subtotal || 0) + (order.tax?.amount || 0) + (order.serviceCharge?.amount || 0) - (order.discount?.amount || 0) - (order.voucher?.discountAmount || 0);
    const hasImplicitDiscount = Math.abs(calculatedTotal - order.total) > 0.01 && calculatedTotal > order.total;

    return (
      <TouchableOpacity 
        style={[
          styles.orderCard, 
          isPendingCustomerOrder && styles.newOrderCard
        ]} 
        key={order.id}
        onPress={() => {
          if (order.status === 'completed' || order.status === 'refunded') {
            setSelectedOrder(order);
            setShowOrderModal(true);
          }
        }}
      >
        {/* Status moved to the top */}
        <View style={styles.cardTopSection}>
          <Text style={[
            styles.statusText,
            { backgroundColor: getOrderStatusColor(order.status, order.source) }
          ]}>
            {order.status.toUpperCase()}
          </Text>
          <Text style={styles.sourceTopText}>
            {order.source === 'pos' ? 'POS' : 'Mobile App'}
          </Text>
        </View>

        {/* Main content area that can grow */}
        <View style={{ flex: 1 }}> 
          {isPendingCustomerOrder && (
            <View style={styles.newOrderBadge}>
              <Text style={styles.newOrderBadgeText}>New Order</Text>
            </View>
          )}
          {/* Header without status badge */}
          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.orderId}>Order #{order.id.slice(-6)}</Text>
              <Text style={styles.orderTime}>
                {order.createdAt.toLocaleString()}
              </Text>
              {order.completedAt && (
                <Text style={styles.completedTime}>
                  Completed: {order.completedAt.toLocaleString()}
                </Text>
              )}
              {order.refundedAt && (
                <View>
                  <Text style={[styles.completedTime, { color: '#9333EA' }]}>
                    Refunded: {order.refundedAt.toLocaleString()}
                  </Text>
                  {order.refundReason && (
                    <Text style={[styles.completedTime, { color: '#9333EA', fontStyle: 'italic' }]} numberOfLines={1} ellipsizeMode="tail">
                      Reason: {order.refundReason}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>

          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>
              <Text style={styles.label}>Customer: </Text>
              {order.customerName}
            </Text>
            <Text style={styles.orderDetails}>
              <Text style={styles.label}>Payment: </Text>
              {order.paymentMethod}
            </Text>
            <Text style={styles.orderDetails}>
              <Text style={styles.label}>Dining: </Text>
              {order.diningMode}
            </Text>
            <Text style={styles.orderDetails}>
              <Text style={styles.label}>Staff: </Text>
              {order.staffName ? `${order.staffName} (${order.staffEmail})` : order.staffEmail}
            </Text>
          </View>

          <View style={styles.itemsContainer}>
            {displayedItems.map((item, index) => (
              <View key={index} style={styles.item}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.size && (
                    <Text style={styles.itemSize}>Size: {item.size}</Text>
                  )}
                </View>
                <Text style={styles.itemQuantity}>x{item.quantity}</Text>
                <Text style={styles.itemPrice}>₱{item.total.toFixed(2)}</Text>
              </View>
            ))}
            
            {/* Show More/Less Button */}
            {hasMoreItems && (
              <TouchableOpacity 
                style={styles.expandButton}
                onPress={(e) => {
                  e.stopPropagation(); // Prevent card touch event
                  toggleOrderExpansion(order.id);
                }}
              >
                <Text style={styles.expandButtonText}>
                  {isExpanded ? 'Show Less' : `Show More (${order.items.length - itemsToShowCollapsed} more items)`}
                </Text>
                <FontAwesome 
                  name={isExpanded ? "chevron-up" : "chevron-down"} 
                  size={14} 
                  color="#4B5563" 
                  style={{marginLeft: 4}} 
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.totalContainer}>
            {hasDiscount && (
              <View style={styles.discountRow}>
                <Text style={styles.discountText}>
                  <FontAwesome name="tag" size={14} color="#10B981" style={{marginRight: 4}} /> 
                  {order.discount?.type || 'Discount'} {order.discount?.percentage && order.discount.percentage > 0 && `(${order.discount.percentage}%)`}:
                </Text>
                <Text style={styles.discountAmount}>-₱{order.discount?.amount.toFixed(2)}</Text>
              </View>
            )}
            {(hasDiscount || hasVoucher || (order.tax && order.tax.amount > 0) || (order.serviceCharge && order.serviceCharge.amount > 0)) && order.subtotal && (
              <Text style={styles.subtotal}>
                Subtotal (net of VAT): ₱{order.subtotal.toFixed(2)}
              </Text>
            )}
            {hasImplicitDiscount && !hasDiscount && !hasVoucher && (
              <View style={styles.discountRow}>
                <Text style={styles.discountText}>
                  <FontAwesome name="tag" size={14} color="#10B981" style={{marginRight: 4}} /> 
                  Voucher:
                </Text>
                <Text style={styles.discountAmount}>-₱{(calculatedTotal - order.total).toFixed(2)}</Text>
              </View>
            )}
            {order.tax && order.tax.amount > 0 && (
              <View style={styles.taxRow}>
                <Text style={styles.taxText}>
                  <FontAwesome name="calculator" size={14} color="#3B82F6" style={{marginRight: 4}} />
                  {order.tax.label || 'VAT'} ({order.tax.percentage}%):
                </Text>
                <Text style={styles.taxAmount}>₱{order.tax.amount.toFixed(2)}</Text>
              </View>
            )}
            <Text style={styles.total}>
              Total: ₱{order.total.toFixed(2)}
            </Text>
          </View>
        </View> 
        {/* End Main Content Area */}

        {/* Action buttons / View Details at the bottom */}
        {showStatusButtons && (
          <View style={styles.orderActions}> 
            {order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'refunded' && (
              <View style={styles.statusButtonContainer}>
                {order.status === 'pending' && (
                  <TouchableOpacity
                    style={[
                      styles.statusButton,
                      { backgroundColor: '#3B82F6', marginBottom: 0 }, // Removed marginBottom
                      isPendingCustomerOrder && styles.highlightedButton,
                    ]}
                    onPress={() => handleStatusChange(order.id, 'processing')}
                  >
                    <Text style={styles.statusButtonText}>
                      {isPendingCustomerOrder ? 'Start Processing ' : 'Processing'}
                    </Text>
                  </TouchableOpacity>
                )}
                {order.status === 'processing' && (
                  <TouchableOpacity
                    style={[styles.statusButton, { backgroundColor: '#F59E0B', marginBottom: 0 }]} // Removed marginBottom
                    onPress={() => handleStatusChange(order.id, 'ready for pickup')}
                  >
                    <Text style={styles.statusButtonText}>Ready</Text>
                  </TouchableOpacity>
                )}
                {order.status === 'ready for pickup' && (
                  <TouchableOpacity
                    style={[styles.statusButton, { backgroundColor: '#10B981', marginBottom: 0 }]} // Removed marginBottom
                    onPress={() => handleStatusChange(order.id, 'completed')}
                  >
                    <Text style={styles.statusButtonText}>Complete</Text>
                  </TouchableOpacity>
                )}
                {(order.status === 'pending' || order.status === 'processing' || order.status === 'ready for pickup') && (
                  <TouchableOpacity
                    style={[styles.statusButton, { backgroundColor: '#EF4455', marginBottom: 0 }]} // Removed marginBottom
                    onPress={() => handleStatusChange(order.id, 'cancelled')}
                  >
                    <Text style={styles.statusButtonText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {(order.status === 'completed' || order.status === 'refunded') && (
          <View style={styles.viewDetailsContainer}>
            <Text style={styles.viewDetailsText}>
              {order.status === 'refunded' ? 'Tap to view refund details' : 'Tap to view details'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderOrderModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showOrderModal}
      onRequestClose={() => {
        setShowOrderModal(false);
        setSelectedOrder(null);
        setRefundReason('');
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.orderModalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderContent}>
              <FontAwesome name="file-text-o" size={22} color="#F36514" style={{marginRight: 10}} />
              <Text style={styles.modalTitle}>Order Details</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowOrderModal(false);
                setSelectedOrder(null);
                setRefundReason('');
              }}
              style={styles.closeButton}
            >
              <FontAwesome name="times" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {selectedOrder && (
            <ScrollView style={styles.orderModalScrollView}>
              <View style={styles.orderTopSection}>
                <View style={styles.orderIdBadge}>
                  <Text style={styles.orderIdBadgeText}>#{selectedOrder.id.slice(-6)}</Text>
                </View>
                
                {/* Move View Receipt button to top section */}
                <TouchableOpacity
                  style={styles.viewReceiptButtonTop}
                  onPress={() => setShowReceiptModal(true)}
                >
                  <FontAwesome name="file-text-o" size={16} color="#FFFFFF" style={{marginRight: 8}} />
                  <Text style={styles.viewReceiptButtonText}>View Receipt</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.orderModalSection}>
                <Text style={styles.orderModalSectionTitle}>Order Information</Text>
                <View style={styles.orderInfoGrid}>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Date:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.createdAt?.toLocaleString() || 'N/A'}</Text>
                  </View>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Completed:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.completedAt?.toLocaleString() || 'N/A'}</Text>
                  </View>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Status:</Text>
                    <Text style={[styles.orderInfoValue, { fontWeight: '600', color: getOrderStatusColor(selectedOrder.status, selectedOrder.source) }]}>
                      {selectedOrder.status.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Source:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.source === 'pos' ? 'POS' : 'Mobile App'}</Text>
                  </View>
                </View>
              </View>
              
              {/* Rest of the order modal remains the same */}
              {selectedOrder.status === 'refunded' && (
                <View style={[styles.orderModalSection, { backgroundColor: '#F9F1FF', borderRadius: 8, padding: 12 }]}>
                  <Text style={[styles.orderModalSectionTitle, { color: '#9333EA' }]}>Refund Information</Text>
                  <View style={styles.orderInfoGrid}>
                    <View style={styles.orderInfoItem}>
                      <Text style={styles.orderInfoLabel}>Refunded At:</Text>
                      <Text style={styles.orderInfoValue}>{selectedOrder.refundedAt?.toLocaleString() || 'N/A'}</Text>
                    </View>
                    <View style={[styles.orderInfoItem, { width: '100%' }]}>
                      <Text style={styles.orderInfoLabel}>Refund Reason:</Text>
                      <Text style={styles.orderInfoValue}>{selectedOrder.refundReason || 'No reason provided'}</Text>
                    </View>
                    <View style={styles.orderInfoItem}>
                      <Text style={styles.orderInfoLabel}>Refunded By:</Text>
                      <Text style={styles.orderInfoValue}>{selectedOrder.staffName ? `${selectedOrder.staffName} (${selectedOrder.staffEmail})` : selectedOrder.staffEmail || 'Unknown Staff'}</Text>
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.orderModalSection}>
                <Text style={styles.orderModalSectionTitle}>Customer Information</Text>
                <View style={styles.orderInfoGrid}>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Name:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.customerName}</Text>
                  </View>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Payment Method:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.paymentMethod}</Text>
                  </View>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Dining Mode:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.diningMode}</Text>
                  </View>
                  <View style={styles.orderInfoItem}>
                    <Text style={styles.orderInfoLabel}>Staff:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.staffName ? `${selectedOrder.staffName} (${selectedOrder.staffEmail})` : selectedOrder.staffEmail}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.orderModalSection}>
                <Text style={styles.orderModalSectionTitle}>Order Items</Text>
                <View style={styles.orderItemsContainer}>
                  {selectedOrder.items.map((item, index) => (
                    <View key={index} style={styles.orderModalItem}>
                      <View style={styles.orderModalItemHeader}>
                        <Text style={styles.orderModalItemName}>{item.name}</Text>
                        <Text style={styles.orderModalItemQuantity}>x{item.quantity}</Text>
                      </View>
                      {item.size && (
                        <Text style={styles.orderModalItemSize}>Size: {item.size}</Text>
                      )}
                      <Text style={styles.orderModalItemPrice}>₱{item.total.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
                
                <View style={styles.priceSummaryContainer}>
                  {selectedOrder.subtotal && (
                    <View style={styles.priceSummaryRow}>
                      <Text style={styles.priceSummaryLabel}>Subtotal (net of VAT):</Text>
                      <Text style={styles.priceSummaryValue}>₱{selectedOrder.subtotal.toFixed(2)}</Text>
                    </View>
                  )}
                  
                  {selectedOrder.discount && selectedOrder.discount.amount > 0 && (
                    <View style={styles.priceSummaryRow}>
                      <Text style={styles.priceSummaryLabel}>
                        {selectedOrder.discount.type} ({selectedOrder.discount.percentage}%):
                      </Text>
                      <Text style={[styles.priceSummaryValue, { color: '#10B981' }]}>-₱{selectedOrder.discount.amount.toFixed(2)}</Text>
                    </View>
                  )}
                  
                  {selectedOrder.voucher && selectedOrder.voucher.discountAmount > 0 && (
                    <View style={styles.priceSummaryRow}>
                      <Text style={styles.priceSummaryLabel}>
                        Voucher {selectedOrder.voucher.code}:
                      </Text>
                      <Text style={[styles.priceSummaryValue, { color: '#8B5CF6' }]}>
                        -₱{selectedOrder.voucher.discountAmount.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  
                  {selectedOrder.tax && selectedOrder.tax.amount > 0 && (
                    <View style={styles.priceSummaryRow}>
                      <Text style={styles.priceSummaryLabel}>{selectedOrder.tax.label || 'VAT'} ({selectedOrder.tax.percentage}%):</Text>
                      <Text style={styles.priceSummaryValue}>₱{selectedOrder.tax.amount.toFixed(2)}</Text>
                    </View>
                  )}
                  
                  {selectedOrder.serviceCharge && selectedOrder.serviceCharge.amount > 0 && (
                    <View style={styles.priceSummaryRow}>
                      <Text style={styles.priceSummaryLabel}>Service Charge ({selectedOrder.serviceCharge.percentage}%):</Text>
                      <Text style={styles.priceSummaryValue}>₱{selectedOrder.serviceCharge.amount.toFixed(2)}</Text>
                    </View>
                  )}
                  
                  <View style={styles.priceSummaryTotal}>
                    <Text style={styles.priceSummaryTotalLabel}>Total:</Text>
                    <Text style={styles.priceSummaryTotalValue}>₱{selectedOrder.total.toFixed(2)}</Text>
                  </View>
                </View>
              </View>
              
              {selectedOrder.status !== 'refunded' && (
                <View style={styles.orderModalSection}>
                  <Text style={styles.orderModalSectionTitle}>Refund Order</Text>
                  <Text style={styles.orderModalDescription}>
                    Refunding this order will mark it as refunded and it will not count towards sales.
                  </Text>
                  <TextInput
                    style={styles.refundReasonInput}
                    placeholder="Enter reason for refund"
                    value={refundReason}
                    onChangeText={setRefundReason}
                    multiline
                    numberOfLines={3}
                  />
                  <TouchableOpacity
                    style={styles.refundButton}
                    onPress={handleRefund}
                  >
                    <FontAwesome name="undo" size={16} color="#FFFFFF" style={{marginRight: 8}} />
                    <Text style={styles.refundButtonText}>Process Refund</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchActive(false);
  };

  const filteredCustomerPoints = customerPoints.filter(customer => {
    if (!searchActive) return true;
    return customer.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
  });

  const filteredOrders = orders.filter(order => {
    const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;
    const matchesSource = selectedSource === 'all' || order.source === selectedSource;
    const matchesSearch = !searchOrderCode || 
                         order.id.toLowerCase().includes(searchOrderCode.toLowerCase()) ||
                         order.customerName.toLowerCase().includes(searchOrderCode.toLowerCase());
    
    // Add date filtering
    let matchesDate = true;
    if (filterByDate) {
      const orderDate = order.createdAt;
      const startDateTime = new Date(startDate);
      startDateTime.setHours(0, 0, 0, 0);
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      
      matchesDate = orderDate >= startDateTime && orderDate <= endDateTime;
    }
    
    return matchesStatus && matchesSource && matchesSearch && matchesDate;
  });

  // Load more function with loading indicator
  const loadMoreOrders = () => {
    setLoadingMore(true); // Start loading indicator
    
    // Simulate network delay (remove this in production)
    setTimeout(() => {
      const nextPage = currentPage + 1;
      const startIndex = (nextPage - 1) * ordersPerPage;
      const endIndex = startIndex + ordersPerPage;
      
      const moreFilteredOrders = filteredOrders.slice(startIndex, endIndex);
      
      if (moreFilteredOrders.length > 0) {
        setDisplayedOrders([...displayedOrders, ...moreFilteredOrders]);
        setCurrentPage(nextPage);
      }
      
      if (endIndex >= filteredOrders.length) {
        setHasMoreOrders(false);
      }
      
      setLoadingMore(false); // Stop loading indicator
    }, 500); // Small timeout to show loading state (remove in production)
  };

  // Update displayed orders when filters change OR the underlying order list changes
  useEffect(() => {
    // Reset pagination when filters or base data change
    setCurrentPage(1);

    // Initial set of orders to display based on the latest filtered list
    const initialOrders = filteredOrders.slice(0, ordersPerPage);
    setDisplayedOrders(initialOrders);

    // Check if more orders exist beyond the initial set
    setHasMoreOrders(filteredOrders.length > ordersPerPage);
    // Depend on the base orders list and all filter criteria
  }, [orders, selectedStatus, selectedSource, searchOrderCode, filterByDate, startDate, endDate, ordersPerPage]); // Added dependencies: orders, startDate, endDate

  const renderPointsModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showPointsModal}
      onRequestClose={() => {
        setShowPointsModal(false);
        setSearchQuery('');
        setSearchActive(false);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxWidth: 500 }]}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome name="star" size={24} color="#F59E0B" style={{ marginRight: 10 }} />
              <Text style={styles.modalTitle}>Customer Rewards</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowPointsModal(false);
                setSearchQuery('');
                setSearchActive(false);
              }}
              style={styles.closeButton}
            >
              <FontAwesome name="times" size={24} color="#000" />
            </TouchableOpacity>
          </View>
          
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16, paddingHorizontal: 4 }}>
            Manage customer reward points and redeem rewards when customers reach {pointsThreshold} points.
          </Text>

          <View style={[styles.searchContainer, { marginBottom: 20 }]}>
            <FontAwesome name="search" size={16} color="#6B7280" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by customer name..."
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setSearchActive(text.trim().length > 0);
              }}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSearchActive(false);
                }}
                style={styles.clearButton}
              >
                <FontAwesome name="times-circle" size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {filteredCustomerPoints.length > 0 ? (
            <ScrollView style={styles.pointsList}>
              {filteredCustomerPoints.map((customer) => {
                // Calculate progress percentage for the progress bar
                const pointsForNextReward = customer.points % pointsThreshold;
                const progressPercentage = (pointsForNextReward / pointsThreshold) * 100;
                const hasRewards = Math.floor(customer.points / pointsThreshold) > 0;
                
                return (
                  <View key={customer.id} style={styles.pointsCard}>
                    <View style={styles.pointsInfo}>
                      <Text style={styles.customerNamePoints}>{customer.name}</Text>
                      <Text style={styles.customerEmail}>{customer.email}</Text>
                      
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <FontAwesome name="star" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                        <Text style={styles.pointsValue}>{customer.points} Points</Text>
                      </View>
                      
                      {customer.lastRedeemed && (
                        <Text style={styles.lastRedeemed}>
                          Last Redeemed: {customer.lastRedeemed.toLocaleDateString()}
                        </Text>
                      )}
                      
                      {/* Progress bar */}
                      <View style={{ height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginTop: 8, marginBottom: 8 }}>
                        <View 
                          style={{
                            height: '100%', 
                            width: `${progressPercentage}%`, 
                            backgroundColor: hasRewards ? '#10B981' : '#10B981',
                            borderRadius: 4
                          }}
                        />
                      </View>
                    </View>
                    
                    <View style={styles.pointsActions}>
                      <Text style={styles.pointsProgress}>
                        {hasRewards ? 
                          `${Math.floor(customer.points / pointsThreshold)} reward(s) available!` : 
                          `${pointsThreshold - pointsForNextReward} more points until next reward`}
                      </Text>
                      
                      <View style={styles.pointsButtonsContainer}>
                        {customer.points >= pointsThreshold && (
                          <TouchableOpacity
                            style={styles.redeemButton}
                            onPress={() => handleRedeemPoints(customer.id, customer.points)}
                          >
                            <FontAwesome name="gift" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                            <Text style={styles.redeemButtonText}>Redeem Rewards</Text>
                          </TouchableOpacity>
                        )}
                        
                        <TouchableOpacity
                          style={styles.deletePointsButton}
                          onPress={() => handleDeleteCustomerPoints(customer.id, customer.name)}
                        >
                          <FontAwesome name="trash" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.deletePointsButtonText}>Delete Points</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.noResultsContainer}>
              <FontAwesome name="search" size={40} color="#D1D5DB" style={{ marginBottom: 16 }} />
              <Text style={styles.noResultsText}>
                {searchActive ? 'No customers found' : 'No customers with points'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderDeleteConfirmationModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={showDeleteModal}
      onRequestClose={() => {
        setShowDeleteModal(false);
        setCustomerToDelete(null);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.deleteModalContent}>
          <View style={styles.deleteModalHeader}>
            <FontAwesome name="exclamation-triangle" size={24} color="#EF4444" style={{ marginRight: 10 }} />
            <Text style={styles.deleteModalTitle}>Confirm Delete</Text>
          </View>
          
          {customerToDelete && (
            <Text style={styles.deleteModalMessage}>
              Are you sure you want to delete all points for {customerToDelete.name}?
            </Text>
          )}
          
          <View style={styles.deleteModalButtons}>
            <TouchableOpacity
              style={styles.deleteModalCancelButton}
              onPress={() => {
                setShowDeleteModal(false);
                setCustomerToDelete(null);
              }}
            >
              <Text style={styles.deleteModalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.deleteModalConfirmButton}
              onPress={confirmDeletePoints}
            >
              <FontAwesome name="trash" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.deleteModalConfirmButtonText}>Delete Points</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Update the printReceipt function to preserve the original design
  const printReceipt = async () => {
    if (!selectedOrder) return;
    
    try {
      if (Platform.OS === 'web') {
        // For web platform, we can use the browser's print functionality
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          Alert.alert('Error', 'Unable to open print window. Please check your pop-up blocker settings.');
          return;
        }
        
        // Create a style sheet that preserves the original design but adds print-specific settings
        const printStyles = `
          <style>
            /* Base styles - keeping original design */
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 0; 
              background-color: white;
            }
            
            .receipt-container { 
              max-width: 400px; 
              margin: 0 auto; 
              padding: 20px; 
              border: 1px solid #E5E7EB; 
              border-radius: 8px;
            }
            
            .receipt-header { 
              text-align: center; 
              margin-bottom: 20px; 
              border-bottom: 1px dotted #E5E7EB; 
              padding-bottom: 15px; 
            }
            
            .receipt-title { 
              font-size: 22px; 
              font-weight: bold; 
              color: #1F2937; 
              margin-bottom: 4px; 
            }
            
            .receipt-subtitle { 
              font-size: 16px; 
              color: #4B5563; 
              margin-bottom: 12px; 
            }
            
            .receipt-orderid { 
              font-size: 18px; 
              font-weight: 600; 
              color: #F36514; 
              margin-bottom: 4px; 
            }
            
            .receipt-date { 
              font-size: 14px; 
              color: #6B7280; 
            }
            
            .section-title {
              font-size: 16px;
              font-weight: 600;
              color: #374151;
              margin-bottom: 10px;
              text-transform: uppercase;
            }
            
            .dotted-divider {
              border-bottom: 1px dotted #ccc;
              margin: 10px 0 15px;
            }
            
            .receipt-section { 
              margin-bottom: 15px; 
              padding-bottom: 15px; 
            }
            
            .receipt-text { 
              font-size: 14px; 
              color: #4B5563; 
              margin-bottom: 6px; 
            }
            
            .receipt-item { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 8px; 
            }
            
            .receipt-item-name { 
              flex: 1;
              font-size: 14px; 
              color: #1F2937; 
              font-weight: 500; 
            }
            
            .receipt-item-size { 
              font-size: 12px; 
              color: #6B7280; 
              margin-top: 2px; 
            }
            
            .receipt-item-qty { 
              font-size: 14px; 
              color: #4B5563; 
              width: 40px;
              text-align: center;
            }
            
            .receipt-item-price { 
              font-size: 14px; 
              font-weight: 500; 
              color: #059669; 
              text-align: right; 
              width: 80px; 
            }
            
            .receipt-subtotal,
            .receipt-tax,
            .receipt-discount { 
              font-size: 14px; 
              color: #4B5563; 
              text-align: right; 
              margin-bottom: 5px; 
            }
            
            .receipt-total { 
              font-size: 16px; 
              font-weight: bold; 
              color: #1F2937; 
              text-align: right; 
              margin-top: 8px; 
              border-top: 1px solid #E5E7EB;
              padding-top: 8px;
            }
            
            .receipt-footer { 
              text-align: center;
              margin-top: 20px;
            }
            
            .receipt-thank-you { 
              font-size: 16px; 
              font-weight: 600; 
              color: #F36514; 
              margin-bottom: 8px; 
            }
            
            .receipt-staff { 
              font-size: 12px; 
              color: #6B7280; 
              margin-bottom: 8px; 
            }
            
            .receipt-printed {
              font-size: 10px;
              color: #9CA3AF;
              margin-top: 15px;
              font-style: italic;
            }
            
            .receipt-refunded { 
              margin-top: 10px; 
              padding: 10px; 
              background-color: #F9F1FF; 
              border: 1px solid #9333EA; 
              border-radius: 8px; 
              text-align: center; 
            }
            
            .receipt-refunded-text { 
              font-size: 16px; 
              font-weight: bold; 
              color: #9333EA; 
              margin-bottom: 4px; 
            }
            
            .receipt-refund-reason { 
              font-size: 12px; 
              color: #6B7280; 
              text-align: center; 
            }
            
            /* Print-specific styles to ensure correct sizing */
            @media print {
              @page {
                size: auto;  /* Auto is default, but explicitly setting */
                margin: 0mm; /* Minimize margins in print */
              }
              
              html, body {
                width: 100%;
                margin: 0;
                padding: 0;
              }
              
              .receipt-container {
                width: 100%;
                max-width: 80mm; /* Standard receipt width */
                border: none;
                border-radius: 0;
                box-shadow: none;
                padding: 10px;
                margin: 0 auto;
              }
              
              /* Force background colors to print */
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        `;
        
        // Generate the HTML content for the receipt
        let receiptHTML = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Receipt #${selectedOrder.id.slice(-6)}</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              ${printStyles}
            </head>
            <body>
              <div class="receipt-container">
                <div class="receipt-header">
                  <div class="receipt-title">Brothers' Nook</div>
                  <div class="receipt-subtitle">Receipt</div>
                  <div class="receipt-orderid">Order #${selectedOrder.id.slice(-6)}</div>
                  <div class="receipt-date">${selectedOrder.createdAt?.toLocaleString()}</div>
                </div>

                <div class="section-title">CUSTOMER INFORMATION</div>
                <div class="receipt-text">Name: ${selectedOrder.customerName}</div>
                <div class="receipt-text">Payment: ${selectedOrder.paymentMethod}</div>
                <div class="receipt-text">Dining: ${selectedOrder.diningMode}</div>
                
                <div class="dotted-divider"></div>

                <div class="section-title">ITEMS</div>
        `;
        
        // Add items to the receipt
        for (const item of selectedOrder.items) {
          receiptHTML += `
            <div class="receipt-item">
              <div class="receipt-item-name">
                ${item.name}
                ${item.size ? `<div class="receipt-item-size">Size: ${item.size}</div>` : ''}
              </div>
              <div class="receipt-item-qty">x${item.quantity}</div>
              <div class="receipt-item-price">₱${item.total.toFixed(2)}</div>
            </div>
          `;
        }
        
        // Add pricing summary
        receiptHTML += `
                <div class="dotted-divider"></div>
        `;
        
        if (selectedOrder.subtotal) {
          receiptHTML += `<div class="receipt-subtotal">Subtotal (net of VAT): ₱${selectedOrder.subtotal.toFixed(2)}</div>`;
        }
        
        if (selectedOrder.discount && selectedOrder.discount.amount > 0) {
          receiptHTML += `<div class="receipt-discount">${selectedOrder.discount.type} (${selectedOrder.discount.percentage}%): -₱${selectedOrder.discount.amount.toFixed(2)}</div>`;
        }
        
        if (selectedOrder.voucher && selectedOrder.voucher.discountAmount > 0) {
          receiptHTML += `<div class="receipt-discount">Voucher ${selectedOrder.voucher.code}: -₱${selectedOrder.voucher.discountAmount.toFixed(2)}</div>`;
        }
        
        if (selectedOrder.tax && selectedOrder.tax.amount > 0) {
          receiptHTML += `<div class="receipt-tax">${selectedOrder.tax.label || 'VAT'} (${selectedOrder.tax.percentage}%): ₱${selectedOrder.tax.amount.toFixed(2)}</div>`;
        }
        
        if (selectedOrder.serviceCharge && selectedOrder.serviceCharge.amount > 0) {
          receiptHTML += `<div class="receipt-tax">Service Charge (${selectedOrder.serviceCharge.percentage}%): ₱${selectedOrder.serviceCharge.amount.toFixed(2)}</div>`;
        }
        
        receiptHTML += `<div class="receipt-total">Total: ₱${selectedOrder.total.toFixed(2)}</div>
                
                <div class="dotted-divider"></div>
                
                <div class="receipt-footer">
                  <div class="receipt-thank-you">Thank you for your order!</div>
                  <div class="receipt-staff">Served by: ${selectedOrder.staffName ? `${selectedOrder.staffName} (${selectedOrder.staffEmail})` : selectedOrder.staffEmail}</div>
        `;
        
        // Add refund information if applicable
        if (selectedOrder.status === 'refunded') {
          receiptHTML += `
                  <div class="receipt-refunded">
                    <div class="receipt-refunded-text">REFUNDED</div>
                    <div class="receipt-refund-reason">Reason: ${selectedOrder.refundReason || 'No reason provided'}</div>
                  </div>
          `;
        }
        
        receiptHTML += `
                <div class="receipt-printed">Printed: ${new Date().toLocaleString()}</div>
              </div>
            </div>
            
            <script>
              // Auto-trigger print dialog once content is loaded
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 500);
              };
            </script>
          </body>
        </html>
      `;
      
      printWindow.document.open();
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      
    } else {
      // For mobile platforms, we need to inform the user about the needed library
      Alert.alert(
        'Print Feature',
        'To enable printing on mobile devices, please install the react-native-print library.',
        [
          { text: 'OK' }
        ]
      );
    }
  } catch (error) {
    console.error('Error printing receipt:', error);
    Alert.alert('Error', 'Failed to print the receipt');
  }
};

  // Update the receipt modal to include the print button
  const renderReceiptModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showReceiptModal}
      onRequestClose={() => {
        setShowReceiptModal(false);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.receiptModalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderContent}>
              <FontAwesome name="file-text-o" size={22} color="#F36514" style={{marginRight: 10}} />
              <Text style={styles.modalTitle}>Receipt Preview</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowReceiptModal(false)}
              style={styles.closeButton}
            >
              <FontAwesome name="times" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {selectedOrder && (
            <ScrollView style={styles.receiptModalScrollView} contentContainerStyle={styles.receiptScrollContent}>
              {/* Download buttons at the top */}
              <View style={styles.downloadButtonsContainer}>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={downloadReceiptAsImage}
                  disabled={downloadingImage}
                >
                  {downloadingImage ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{marginRight: 8}} />
                  ) : (
                    <FontAwesome name="image" size={16} color="#FFFFFF" style={{marginRight: 8}} />
                  )}
                  <Text style={styles.downloadButtonText}>
                    {downloadingImage ? 'Downloading...' : 'Download as Image'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.downloadButton, { backgroundColor: '#374151' }]}
                  onPress={downloadReceiptAsPDF}
                  disabled={downloadingPDF}
                >
                  {downloadingPDF ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{marginRight: 8}} />
                  ) : (
                    <FontAwesome name="file-pdf-o" size={16} color="#FFFFFF" style={{marginRight: 8}} />
                  )}
                  <Text style={styles.downloadButtonText}>
                    {downloadingPDF ? 'Generating...' : 'Download as PDF'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {/* Add Print Button */}
              <TouchableOpacity
                style={styles.printButton}
                onPress={printReceipt}
              >
                <FontAwesome name="print" size={16} color="#FFFFFF" style={{marginRight: 8}} />
                <Text style={styles.printButtonText}>Print Receipt</Text>
              </TouchableOpacity>

              {/* Receipt View for display and capture */}
              <View style={styles.receiptPreviewContainer}>
                <ViewShot ref={receiptRef} options={{ format: 'png', quality: 0.9 }}>
                  <View style={styles.receiptContainer}>
                    <View style={styles.receiptHeader}>
                      <Text style={styles.receiptTitle}>Brothers' Nook</Text>
                      <Text style={styles.receiptSubtitle}>Receipt</Text>
                      <Text style={styles.receiptOrderId}>Order #{selectedOrder.id.slice(-6)}</Text>
                      <Text style={styles.receiptDate}>{selectedOrder.createdAt?.toLocaleString()}</Text>
                    </View>

                    <View style={styles.receiptSection}>
                      <Text style={styles.receiptSectionTitle}>Customer Information</Text>
                      <Text style={styles.receiptText}>Name: {selectedOrder.customerName}</Text>
                      <Text style={styles.receiptText}>Payment: {selectedOrder.paymentMethod}</Text>
                      <Text style={styles.receiptText}>Dining: {selectedOrder.diningMode}</Text>
                    </View>

                    <View style={styles.receiptSection}>
                      <Text style={styles.receiptSectionTitle}>Items</Text>
                      {selectedOrder.items.map((item, index) => (
                        <View key={index} style={styles.receiptItem}>
                          <View style={styles.receiptItemDetails}>
                            <Text style={styles.receiptItemName}>{item.name}</Text>
                            {item.size && <Text style={styles.receiptItemSize}>Size: {item.size}</Text>}
                          </View>
                          <Text style={styles.receiptItemQty}>x{item.quantity}</Text>
                          <Text style={styles.receiptItemPrice}>₱{item.total.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.receiptSection}>
                      {selectedOrder.subtotal && (
                        <Text style={styles.receiptSubtotalText}>Subtotal (net of VAT): ₱{selectedOrder.subtotal.toFixed(2)}</Text>
                      )}
                      
                      {selectedOrder.discount && selectedOrder.discount.amount > 0 && (
                        <Text style={styles.receiptDiscountText}>
                          {selectedOrder.discount.type} ({selectedOrder.discount.percentage}%): -₱{selectedOrder.discount.amount.toFixed(2)}
                        </Text>
                      )}
                      
                      {selectedOrder.voucher && selectedOrder.voucher.discountAmount > 0 && (
                        <Text style={styles.receiptDiscountText}>
                          Voucher {selectedOrder.voucher.code}: -₱{selectedOrder.voucher.discountAmount.toFixed(2)}
                        </Text>
                      )}
                      
                      {selectedOrder.tax && selectedOrder.tax.amount > 0 && (
                        <Text style={styles.receiptTaxText}>
                          {selectedOrder.tax.label || 'VAT'} ({selectedOrder.tax.percentage}%): ₱{selectedOrder.tax.amount.toFixed(2)}
                        </Text>
                      )}
                      
                      {selectedOrder.serviceCharge && selectedOrder.serviceCharge.amount > 0 && (
                        <Text style={styles.receiptServiceText}>
                          Service Charge ({selectedOrder.serviceCharge.percentage}%): ₱{selectedOrder.serviceCharge.amount.toFixed(2)}
                        </Text>
                      )}
                      
                      <Text style={styles.receiptTotalText}>Total: ₱{selectedOrder.total.toFixed(2)}</Text>
                    </View>
                    
                    <View style={styles.receiptFooter}>
                      <Text style={styles.receiptThankYou}>Thank you for your order!</Text>
                      <Text style={styles.receiptStaff}>Served by: {selectedOrder.staffName ? `${selectedOrder.staffName} (${selectedOrder.staffEmail})` : selectedOrder.staffEmail}</Text>
                      {selectedOrder.status === 'refunded' && (
                        <View style={styles.receiptRefunded}>
                          <Text style={styles.receiptRefundedText}>REFUNDED</Text>
                          <Text style={styles.receiptRefundReason}>Reason: {selectedOrder.refundReason || 'No reason provided'}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </ViewShot>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4169E1" />
      </View>
    );
  }

  function renderFilterModal(): React.ReactNode {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={showFilterModal}
        onRequestClose={() => {
          setShowFilterModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Orders</Text>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                style={styles.closeButton}
              >
                <FontAwesome name="times" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterModalContent}>
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <Text style={styles.filterSectionTitle}>Order Status</Text>
                </View>
                <View style={styles.filterButtonsGrid}>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedStatus === 'all' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedStatus('all')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedStatus === 'all' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedStatus === 'pending' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedStatus('pending')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedStatus === 'pending' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      Pending
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedStatus === 'processing' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedStatus('processing')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedStatus === 'processing' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      Processing
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedStatus === 'ready for pickup' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedStatus('ready for pickup')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedStatus === 'ready for pickup' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      Ready
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedStatus === 'completed' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedStatus('completed')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedStatus === 'completed' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      Completed
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedStatus === 'cancelled' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedStatus('cancelled')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedStatus === 'cancelled' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      Cancelled
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedStatus === 'refunded' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedStatus('refunded')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedStatus === 'refunded' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      Refunded
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <Text style={styles.filterSectionTitle}>Order Source</Text>
                </View>
                <View style={styles.filterButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedSource === 'all' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedSource('all')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedSource === 'all' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedSource === 'pos' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedSource('pos')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedSource === 'pos' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      POS
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterModalButton,
                      selectedSource === 'customer' && styles.filterModalButtonActive,
                    ]}
                    onPress={() => setSelectedSource('customer')}
                  >
                    <Text
                      style={[
                        styles.filterModalButtonText,
                        selectedSource === 'customer' && styles.filterModalButtonTextActive,
                      ]}
                    >
                      Mobile App
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <Text style={styles.filterSectionTitle}>Date Range</Text>
                  <TouchableOpacity
                    style={styles.toggleButton}
                    onPress={() => setFilterByDate(!filterByDate)}
                  >
                    <View style={[styles.toggleTrack, filterByDate && styles.toggleTrackActive]}>
                      <View style={[styles.toggleThumb, filterByDate && styles.toggleThumbActive]} />
                    </View>
                    <Text style={styles.toggleText}>{filterByDate ? 'Enabled' : 'Disabled'}</Text>
                  </TouchableOpacity>
                </View>
                {filterByDate && (
                  <View style={styles.datePickerContainer}>
                    <View style={styles.datePickerRow}>
                      <Text style={styles.datePickerLabel}>From:</Text>
                      <TextInput
                        style={styles.dateInput}
                        placeholder="MM/DD/YYYY"
                        value={startDate.toLocaleDateString()}
                        onChangeText={(text) => {
                          try {
                            const date = new Date(text);
                            if (!isNaN(date.getTime())) {
                              setStartDate(date);
                            }
                          } catch (error) {
                            console.log("Invalid date format");
                          }
                        }}
                      />
                    </View>
                    <View style={styles.datePickerRow}>
                      <Text style={styles.datePickerLabel}>To:</Text>
                      <TextInput
                        style={styles.dateInput}
                        placeholder="MM/DD/YYYY"
                        value={endDate.toLocaleDateString()}
                        onChangeText={(text) => {
                          try {
                            const date = new Date(text);
                            if (!isNaN(date.getTime())) {
                              setEndDate(date);
                            }
                          } catch (error) {
                            console.log("Invalid date format");
                          }
                        }}
                      />
                    </View>
                    <Text style={styles.dateFormatHelp}>Enter dates in MM/DD/YYYY format</Text>
                  </View>
                )}
              </View>

              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <Text style={styles.filterSectionTitle}>Search</Text>
                </View>
                <View style={styles.searchContainer}>
                  <FontAwesome name="search" size={16} color="#6B7280" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by order ID or customer name..."
                    value={searchOrderCode}
                    onChangeText={setSearchOrderCode}
                    returnKeyType="search"
                    autoCapitalize="none"
                  />
                  {searchOrderCode.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchOrderCode('')}
                      style={styles.clearButton}
                    >
                      <FontAwesome name="times-circle" size={16} color="#6B7280" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <FontAwesome name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Orders</Text>
        <View style={{flex: 1, flexDirection: 'row', justifyContent: 'flex-end'}}>
          {pendingCustomerOrders.length > 0 && (
            <View style={styles.newOrderAlert}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <FontAwesome name="bell" size={20} color="#FFFFFF" />
              </Animated.View>
              <Text style={styles.newOrderAlertText}>
                {pendingCustomerOrders.length} New {pendingCustomerOrders.length === 1 ? 'Order' : 'Orders'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.pointsButton}
            onPress={() => setShowPointsModal(true)}
          >
            <FontAwesome name="star" size={20} color="#FFFFFF" />
            <Text style={styles.pointsButtonText}>Customer Points</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterButtonContainer}>
        <TouchableOpacity
          style={styles.filterMainButton}
          onPress={() => setShowFilterModal(true)}
        >
          <FontAwesome name="filter" size={16} color="#FFFFFF" style={styles.filterIcon} />
          <Text style={styles.filterMainButtonText}>Filter Orders</Text>
        </TouchableOpacity>
      </View>

      {renderFilterModal()}
      {renderPointsModal()}
      {renderOrderModal()}
      {renderReceiptModal()}
      {renderDeleteConfirmationModal()}
      <ScrollView style={styles.ordersList}>
        <View style={styles.ordersGrid}>
          {displayedOrders.map((order) => (
            <View key={order.id} style={styles.orderCardContainer}>
              {renderOrderCard(order)}
            </View>
          ))}
        </View>
        
        {/* Load More button with loading indicator */}
        {hasMoreOrders && !loading && (
          <TouchableOpacity 
            style={[styles.loadMoreButton, loadingMore && { opacity: 0.7 }]}
            onPress={loadMoreOrders}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 10 }} />
            ) : (
              <FontAwesome name="angle-down" size={16} color="#FFFFFF" style={{ marginRight: 10 }} />
            )}
            <Text style={styles.loadMoreButtonText}>
              {loadingMore ? 'Loading...' : 'Load More Orders'}
            </Text>
          </TouchableOpacity>
        )}
        
        {/* Show a message when no more orders */}
        {!hasMoreOrders && displayedOrders.length > 0 && filteredOrders.length > ordersPerPage && (
          <Text style={styles.noMoreOrdersText}>No more orders to load</Text>
        )}
        
        {/* Show message when no orders match filters */}
        {displayedOrders.length === 0 && !loading && (
          <View style={styles.noOrdersContainer}>
            <FontAwesome name="inbox" size={40} color="#D1D5DB" style={{ marginBottom: 16 }} />
            <Text style={styles.noOrdersText}>No orders match your filters</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  refundInfoSection: {
    backgroundColor: '#F9F1FF',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#9333EA',
    marginBottom: 16,
  },
  refundInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9333EA',
    marginBottom: 8,
  },
  refundInfoText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  viewDetailsContainer: {
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  viewDetailsText: {
    fontSize: 14,
    color: '#4B5563',
    fontStyle: 'italic',
  },
  orderModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 800,
    maxHeight: '90%',
  },
  orderModalScrollView: {
    maxHeight: '90%',
  },
  orderIdBadge: {
    backgroundColor: '#F36514',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  orderIdBadgeText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  orderModalSection: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 20,
  },
  orderModalSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  orderInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  orderInfoItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  orderInfoLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  orderInfoValue: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  orderItemsContainer: {
    marginBottom: 16,
  },
  orderModalItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  orderModalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderModalItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    flex: 1,
  },
  orderModalItemQuantity: {
    fontSize: 15,
    color: '#4B5563',
    marginLeft: 8,
  },
  orderModalItemSize: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  orderModalItemPrice: {
    fontSize: 15,
    fontWeight: '500',
    color: '#059669',
    marginTop: 8,
    textAlign: 'right',
  },
  priceSummaryContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  priceSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceSummaryLabel: {
    fontSize: 15,
    color: '#4B5563',
  },
  priceSummaryValue: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  priceSummaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  priceSummaryTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  priceSummaryTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
  },
  refundReasonInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    marginBottom: 16,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  refundButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  refundButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  pointsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F36514',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  pointsButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 8,
    fontWeight: '500',
  },
  filters: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterGroup: {
    gap: 8,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 8,
    width: 55,
  },
  filterScroll: {
    flexDirection: 'row',
    flex: 1,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
  },
  filterButtonActive: {
    backgroundColor: '#2563EB',
  },
  filterButtonText: {
    fontSize: 13,
    color: '#4B5563',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  ordersList: {
    flex: 1,
    padding: 12,
  },
  ordersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  orderCardContainer: {
    width: '32%', // Changed from 48% back to ~33% for 3 columns
    marginBottom: 12,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12, // Keep overall padding
    // height: '100%', // Removed this line - already removed
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'column', // Added for flex layout
    justifyContent: 'space-between', // Added to push buttons down
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start', // Align items to top to prevent stretching vertically
    // marginBottom: 12, // Removed, spacing handled by elements below
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  orderTime: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  completedTime: {
    fontSize: 13,
    color: '#059669',
    marginTop: 2,
  },
  orderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    // No status text here anymore
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    // Removed alignSelf: 'flex-end' - now handled inline
  },
  source: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  customerInfo: {
    marginBottom: 16,
  },
  customerName: {
    fontSize: 15,
    color: '#1F2937',
  },
  orderDetails: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  itemsContainer: {
    marginBottom: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    color: '#1F2937',
  },
  itemSize: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  itemQuantity: {
    fontSize: 14,
    color: '#4B5563',
    marginHorizontal: 12,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
  },
  totalContainer: {
    marginTop: 12,
    // paddingTop: 12, // Remove top padding if border exists
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  discountText: {
    fontSize: 14,
    color: '#6B7280',
  },
  discountAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
  },
  voucherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  voucherText: {
    fontSize: 14,
    color: '#6B7280',
  },
  voucherAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8B5CF6',
  },
  subtotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'right',
  },
  total: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'right',
  },
  orderActions: {
    flexDirection: 'row', // Keep row for buttons themselves
    justifyContent: 'center', // Center the buttons
    marginTop: 16, // Add margin above buttons
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  statusButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8, // Keep space between buttons
    alignItems: 'center',
  },
  statusButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: '90%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  closeButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  clearButton: {
    padding: 8,
  },
  pointsList: {
    maxHeight: '80%',
  },
  pointsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pointsInfo: {
    marginBottom: 16,
  },
  customerNamePoints: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  customerEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  pointsValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F36514',
    marginBottom: 8,
  },
  lastRedeemed: {
    fontSize: 13,
    color: '#059669',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  pointsActions: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
    width: '100%',
  },
  pointsButtonsContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  pointsProgress: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  redeemButton: {
    backgroundColor: '#F36514',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  redeemButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deletePointsButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deletePointsButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  noResultsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginTop: 16,
  },
  noResultsText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  statusButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center', 
    gap: 8,
  },
  filterButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterMainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F36514',
    paddingVertical: 12,
    borderRadius: 8,
  },
  filterMainButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  filterIcon: {
    marginRight: 4,
  },
  filterModalContent: {
    padding: 16,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  filterSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterModalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginBottom: 8,
  },
  filterModalButtonActive: {
    backgroundColor: '#F36514',
  },
  filterModalButtonText: {
    fontSize: 14,
    color: '#4B5563',
  },
  filterModalButtonTextActive: {
    color: '#FFFFFF',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleTrack: {
    width: 40,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    marginRight: 8,
  },
  toggleTrackActive: {
    backgroundColor: '#F36514',
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginLeft: 2,
  },
  toggleThumbActive: {
    marginLeft: 22,
  },
  toggleText: {
    fontSize: 14,
    color: '#4B5563',
  },
  datePickerContainer: {
    marginTop: 12,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  datePickerLabel: {
    fontSize: 14,
    color: '#4B5563',
    width: 50,
  },
  dateInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1F2937',
  },
  dateFormatHelp: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  applyFilterButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  applyFilterButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  newOrderCard: {
    borderWidth: 2,
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  newOrderBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    zIndex: 1,
  },
  newOrderBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  highlightedButton: {
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#1D4ED8',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 6,
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taxText: {
    fontSize: 14,
    color: '#6B7280',
  },
  taxAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
  },
  serviceChargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceChargeText: {
    fontSize: 14,
    color: '#6B7280',
  },
  serviceChargeAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8B5CF6',
  },
  newOrderAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 'auto',
    marginRight: 12,
  },
  newOrderAlertText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 8,
    fontWeight: '600',
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderModalDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  deleteModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  deleteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  deleteModalMessage: {
    fontSize: 16,
    color: '#4B5563',
    marginBottom: 24,
    lineHeight: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  deleteModalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  deleteModalCancelButtonText: {
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '500',
  },
  deleteModalConfirmButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteModalConfirmButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  cardTopSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sourceTopText: {
    fontSize: 14,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    fontWeight: '500',
  },
  loadMoreButton: {
    backgroundColor: '#F36514',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loadMoreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  noMoreOrdersText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
    marginTop: 16,
    marginBottom: 32,
    fontStyle: 'italic',
  },
  noOrdersContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginTop: 16,
  },
  noOrdersText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  // Receipt download styles
  downloadButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
    gap: 12,
    width: '100%',
    maxWidth: 400,
  },
  downloadButton: {
    backgroundColor: '#F36514',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Receipt styles for PDF/image generation
  receiptContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 15,
  },
  receiptTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  receiptSubtitle: {
    fontSize: 16,
    color: '#4B5563',
    marginBottom: 12,
  },
  receiptOrderId: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F36514',
    marginBottom: 4,
  },
  receiptDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  receiptSection: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  receiptSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  receiptText: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  receiptItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  receiptItemDetails: {
    flex: 1,
  },
  receiptItemName: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  receiptItemSize: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  receiptItemQty: {
    fontSize: 14,
    color: '#4B5563',
    marginHorizontal: 8,
  },
  receiptItemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
    textAlign: 'right',
    width: 80,
  },
  receiptSubtotalText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'right',
    marginBottom: 4,
  },
  receiptDiscountText: {
    fontSize: 14,
    color: '#10B981',
    textAlign: 'right',
    marginBottom: 4,
  },
  receiptTaxText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'right',
    marginBottom: 4,
  },
  receiptServiceText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'right',
    marginBottom: 4,
  },
  receiptTotalText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'right',
    marginTop: 8,
  },
  receiptFooter: {
    alignItems: 'center',
  },
  receiptThankYou: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F36514',
    marginBottom: 8,
  },
  receiptStaff: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  receiptRefunded: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F9F1FF',
    borderWidth: 1,
    borderColor: '#9333EA',
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  receiptRefundedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9333EA',
    marginBottom: 4,
  },
  receiptRefundReason: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  viewReceiptButton: {
    backgroundColor: '#F36514',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  viewReceiptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  receiptModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 800,
    maxHeight: '90%',
  },
  receiptModalScrollView: {
    maxHeight: '90%',
  },
  receiptPreviewContainer: {
    marginBottom: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  orderTopSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewReceiptButtonTop: {
    backgroundColor: '#F36514',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  viewReceiptButtonTextTop: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  receiptScrollContent: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  printButton: {
    backgroundColor: '#F36514',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
    maxWidth: 400,
  },
  printButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    alignSelf: 'center',
  },
  expandButtonText: {
    fontSize: 14,
    color: '#4B5563',
    marginRight: 4,
  },
});
