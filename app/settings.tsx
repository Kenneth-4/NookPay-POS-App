import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView, Switch, Image, Platform, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { doc, getDoc, setDoc, arrayUnion, arrayRemove, updateDoc, DocumentData, DocumentReference, Timestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from '../utils/cloudinary';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Banner {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  targetRoute: string;
  createdAt: string;
}

interface VoucherSettings {
  id: string;
  code: string;
  description: string;
  discountAmount: number;
  minimumOrderAmount: number;
  maxUsagePerUser: number;
  enabled: boolean;
}

// Add interface for old voucher format for backward compatibility
interface LegacyVoucherSettings {
  id: string;
  code: string;
  description: string;
  discountPercentage: number;
  minimumOrderAmount: number;
  maxUsagePerUser: number;
  enabled: boolean;
}

interface Product {
  id: string;
  name: string;
  imageUrl: string;
  basePrice: string;
  categoryId: string;
}

interface Settings {
  general: {
    enableNotifications: boolean;
    notificationSound: boolean;
  };
  inventory: {
    lowStockThreshold: number;
    enableAlerts: boolean;
    autoReorderPoint: number;
  };
  rewards: {
    pointsPerItem: number;
    pointsThreshold: number;
    enabled: boolean;
  };
  banners: Banner[];
  bestSellers: {
    products: string[];
  };
  vouchers: VoucherSettings[];
}

export default function Settings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showFromDatePicker, setShowFromDatePicker] = useState(false);
  const [showToDatePicker, setShowToDatePicker] = useState(false);
  const [isVoucherModalVisible, setIsVoucherModalVisible] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<VoucherSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [showProductSelectionModal, setShowProductSelectionModal] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [voucherToDelete, setVoucherToDelete] = useState<VoucherSettings | null>(null);
  const [voucherFormError, setVoucherFormError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Settings saved successfully!');
  const [voucherFormData, setVoucherFormData] = useState<Omit<VoucherSettings, 'id'>>({
    code: '',
    description: '',
    discountAmount: 0,
    minimumOrderAmount: 0,
    maxUsagePerUser: 1,
    enabled: true,
  });
  const [settings, setSettings] = useState<Settings>({
    banners: [],
    general: {
      enableNotifications: true,
      notificationSound: true
    },
    inventory: {
      lowStockThreshold: 10,
      enableAlerts: true,
      autoReorderPoint: 5
    },
    rewards: {
      pointsPerItem: 1,
      pointsThreshold: 100,
      enabled: true
    },
    bestSellers: {
      products: []
    },
    vouchers: []
  });

  useEffect(() => {
    loadSettings();
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const q = query(collection(db, 'products'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const productsList = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
          imageUrl: doc.data().imageUrl || '',
          basePrice: doc.data().basePrice || '',
          categoryId: doc.data().categoryId
        }));
        setProducts(productsList);
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'config');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        
        // Migrate vouchers from percentage to amount format if needed
        const migratedVouchers = (data.vouchers || []).map((voucher: any) => {
          // If voucher has discountPercentage but not discountAmount, create discountAmount
          if (voucher.discountPercentage !== undefined && voucher.discountAmount === undefined) {
            return {
              ...voucher,
              discountAmount: voucher.discountPercentage, // You can define a conversion logic here if needed
            };
          }
          return voucher;
        });
        
        setSettings(prev => ({
          ...prev,
          banners: data.banners || [],
          general: {
            enableNotifications: data.general?.enableNotifications ?? prev.general.enableNotifications,
            notificationSound: data.general?.notificationSound ?? prev.general.notificationSound
          },
          inventory: {
            lowStockThreshold: data.inventory?.lowStockThreshold ?? prev.inventory.lowStockThreshold,
            enableAlerts: data.inventory?.enableAlerts ?? prev.inventory.enableAlerts,
            autoReorderPoint: data.inventory?.autoReorderPoint ?? prev.inventory.autoReorderPoint
          },
          rewards: {
            pointsPerItem: data.rewards?.pointsPerItem ?? prev.rewards.pointsPerItem,
            pointsThreshold: data.rewards?.pointsThreshold ?? prev.rewards.pointsThreshold,
            enabled: data.rewards?.enabled ?? prev.rewards.enabled
          },
          bestSellers: {
            products: data.bestSellers?.products || []
          },
          vouchers: migratedVouchers
        }));
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const settingsRef = doc(db, 'settings', 'config');
      
      const settingsToSave = {
        banners: settings.banners,
        general: settings.general,
        inventory: settings.inventory,
        rewards: settings.rewards,
        bestSellers: {
          products: settings.bestSellers.products
        },
        vouchers: settings.vouchers
      };

      await setDoc(settingsRef, settingsToSave, { merge: true });
      setSuccessMessage('Settings saved successfully!');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFromDateChange = (event: any, selectedDate?: Date) => {
    setShowFromDatePicker(false);
    if (selectedDate) {
      setSettings(prev => ({
        ...prev,
        bestSellers: {
          ...prev.bestSellers,
          fromDate: selectedDate
        }
      }));
    }
  };

  const handleToDateChange = (event: any, selectedDate?: Date) => {
    setShowToDatePicker(false);
    if (selectedDate) {
      setSettings(prev => ({
        ...prev,
        bestSellers: {
          ...prev.bestSellers,
          toDate: selectedDate
        }
      }));
    }
  };

  const renderGeneralSettings = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Notification Settings</Text>

      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Enable Notifications</Text>
        <Switch
          value={settings.general.enableNotifications}
          onValueChange={(value) => setSettings(prev => ({
            ...prev,
            general: { ...prev.general, enableNotifications: value }
          }))}
        />
      </View>

      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Notification Sound</Text>
        <Switch
          value={settings.general.notificationSound}
          onValueChange={(value) => setSettings(prev => ({
            ...prev,
            general: { ...prev.general, notificationSound: value }
          }))}
        />
      </View>
    </View>
  );

  const renderRewardsSettings = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Customer Rewards</Text>
      
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Enable Rewards Program</Text>
        <Switch
          value={settings.rewards.enabled}
          onValueChange={(value) => setSettings(prev => ({
            ...prev,
            rewards: { ...prev.rewards, enabled: value }
          }))}
        />
      </View>

      <View style={[styles.settingItem, !settings.rewards.enabled && styles.disabledSetting]}>
        <Text style={styles.settingLabel}>Points Per Item</Text>
        <TextInput
          style={[styles.input, !settings.rewards.enabled && styles.disabledInput]}
          value={settings.rewards.pointsPerItem.toString()}
          onChangeText={(text) => {
            const value = parseInt(text) || 0;
            setSettings(prev => ({
              ...prev,
              rewards: { ...prev.rewards, pointsPerItem: value }
            }));
          }}
          keyboardType="numeric"
          placeholder="Enter points per item"
          editable={settings.rewards.enabled}
        />
      </View>

      <View style={[styles.settingItem, !settings.rewards.enabled && styles.disabledSetting]}>
        <Text style={styles.settingLabel}>Points Threshold for Reward</Text>
        <TextInput
          style={[styles.input, !settings.rewards.enabled && styles.disabledInput]}
          value={settings.rewards.pointsThreshold.toString()}
          onChangeText={(text) => {
            const value = parseInt(text) || 0;
            setSettings(prev => ({
              ...prev,
              rewards: { ...prev.rewards, pointsThreshold: value }
            }));
          }}
          keyboardType="numeric"
          placeholder="Enter points threshold"
          editable={settings.rewards.enabled}
        />
      </View>

      <Text style={styles.sectionDescription}>
        These settings control how customers earn and redeem reward points. Points are earned for each item purchased and can be redeemed when reaching the threshold.
      </Text>
    </View>
  );

  const renderBannerSettings = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Banner Management</Text>

      <View style={styles.bannerList}>
        {(settings.banners || []).map((banner, index) => (
          <View key={banner.id} style={styles.bannerItem}>
            <Image
              source={{ uri: banner.imageUrl }}
              style={styles.bannerPreview}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={styles.deleteBannerButton}
              onPress={() => handleDeleteBanner(banner)}
            >
              <FontAwesome name="trash" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.addBannerButton}
        onPress={handleAddBanner}
        disabled={isUploadingImage}
      >
        {isUploadingImage ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <FontAwesome name="plus" size={20} color="#FFFFFF" />
            <Text style={styles.addBannerButtonText}>Add Banner</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionDescription}>
        Add or remove promotional banners that will be displayed on the home screen.
      </Text>
    </View>
  );

  const handleAddBanner = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'You need to grant permission to access your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 16],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsUploadingImage(true);
        const uploadResult = await uploadImage(result.assets[0].uri);

        if (uploadResult?.secure_url) {
          const newBanner = {
            id: Date.now().toString(),
            imageUrl: uploadResult.secure_url,
            title: '',
            subtitle: '',
            targetRoute: '',
            createdAt: new Date().toISOString(),
          };

          const settingsRef = doc(db, 'settings', 'config');
          await setDoc(settingsRef, {
            banners: arrayUnion(newBanner)
          }, { merge: true });

          setSettings(prev => ({
            ...prev,
            banners: [...(prev.banners || []), newBanner]
          }));

          Alert.alert('Success', 'Banner added successfully');
        } else {
          Alert.alert('Error', 'Failed to upload image to cloud storage');
        }
      }
    } catch (error) {
      console.error('Error adding banner:', error);
      Alert.alert('Error', 'Failed to add banner');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteBanner = async (banner: Banner) => {
    try {
      const settingsRef = doc(db, 'settings', 'config');
      await updateDoc(settingsRef, {
        banners: arrayRemove(banner)
      });

      setSettings(prev => ({
        ...prev,
        banners: prev.banners?.filter(b => b.id !== banner.id) || []
      }));

      Alert.alert('Success', 'Banner deleted successfully');
    } catch (error) {
      console.error('Error deleting banner:', error);
      Alert.alert('Error', 'Failed to delete banner');
    }
  };

  const renderBestSellersSettings = () => {
    const selectedProducts = products.filter(product => 
      settings.bestSellers.products.includes(product.id)
    );
    
    const toggleProductSelection = (id: string): void => {
      setSettings(prev => ({
        ...prev,
        bestSellers: {
          ...prev.bestSellers,
          products: prev.bestSellers.products.filter(productId => productId !== id)
        }
      }));
    };
    
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Best Sellers Selection</Text>
        
        <Text style={styles.bestSellerDescription}>
          Select 3-6 products to feature as best sellers on the menu. 
          These products will be highlighted to customers.
        </Text>
        
        <View style={styles.selectedProductsContainer}>
          {selectedProducts.length > 0 ? (
            <View style={styles.selectedProductsList}>
              {selectedProducts.map(product => (
                <View key={product.id} style={styles.selectedProductItem}>
                  <View style={styles.productInfoContainer}>
                    {product.imageUrl ? (
                      <Image 
                        source={{ uri: product.imageUrl }} 
                        style={styles.productThumbnail} 
                      />
                    ) : (
                      <View style={styles.productPlaceholder}>
                        <FontAwesome name="image" size={20} color="#9CA3AF" />
                      </View>
                    )}
                    <View style={styles.productTextInfo}>
                      <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeProductButton}
                    onPress={() => toggleProductSelection(product.id)}
                  >
                    <FontAwesome name="times" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noProductsText}>No best seller products selected</Text>
          )}
        </View>
        
        <TouchableOpacity
          style={[
            styles.selectProductsButton,
            (selectedProducts.length >= 6) && styles.disabledButton
          ]}
          onPress={() => setShowProductSelectionModal(true)}
          disabled={selectedProducts.length >= 6}
        >
          <FontAwesome name="plus" size={16} color="#FFFFFF" style={styles.buttonIcon} />
          <Text style={styles.selectProductsButtonText}>
            {selectedProducts.length === 0 ? 'Select Products' : 'Modify Selection'}
          </Text>
        </TouchableOpacity>
        
        {selectedProducts.length > 0 && selectedProducts.length < 3 && (
          <Text style={styles.warningText}>
            Please select at least 3 products as best sellers.
          </Text>
        )}
        
        <Text style={styles.sectionDescription}>
          Best sellers will be prominently displayed on the menu to attract customer attention and boost sales.
        </Text>
      </View>
    );
  };

  const handleAddNewVoucher = () => {
    setEditingVoucher(null);
    setVoucherFormError(null);
    setVoucherFormData({
      code: '',
      description: '',
      discountAmount: 0,
      minimumOrderAmount: 0,
      maxUsagePerUser: 1,
      enabled: true,
    });
    setIsVoucherModalVisible(true);
  };

  const handleEditVoucher = (voucher: VoucherSettings) => {
    setEditingVoucher(voucher);
    setVoucherFormError(null);
    // Check if the voucher is using the old format (has discountPercentage)
    const discountAmount = (voucher as any).discountAmount !== undefined 
      ? (voucher as any).discountAmount 
      : (voucher as any).discountPercentage || 0;
    
    setVoucherFormData({
      code: voucher.code,
      description: voucher.description || '',
      discountAmount: discountAmount,
      minimumOrderAmount: voucher.minimumOrderAmount,
      maxUsagePerUser: voucher.maxUsagePerUser ?? 1,
      enabled: voucher.enabled,
    });
    setIsVoucherModalVisible(true);
  };

  const handleDeleteVoucher = (voucherToDelete: VoucherSettings) => {
    setVoucherToDelete(voucherToDelete);
    setIsDeleteModalVisible(true);
  };

  const confirmDeleteVoucher = () => {
    if (voucherToDelete) {
      setSettings(prev => ({
        ...prev,
        vouchers: prev.vouchers.filter(v => v.id !== voucherToDelete.id)
      }));
      setIsDeleteModalVisible(false);
      setVoucherToDelete(null);
    }
  };

  const handleSaveVoucherModal = () => {
    // Reset previous errors
    setVoucherFormError(null);
    
    if (!voucherFormData.code) {
      setVoucherFormError('Voucher code cannot be empty.');
      return;
    }
    const amount = voucherFormData.discountAmount;
    const minAmount = voucherFormData.minimumOrderAmount;
    const maxUsage = voucherFormData.maxUsagePerUser;

    if (amount <= 0) {
      setVoucherFormError('Discount amount must be greater than 0.');
      return;
    }
    if (minAmount < 0) {
      setVoucherFormError('Minimum order amount cannot be negative.');
      return;
    }
    if (maxUsage > 0 && !Number.isInteger(maxUsage)) {
      setVoucherFormError('Max usage per user must be a whole number (or 0 for unlimited).');
      return;
    }

    // Check for duplicate voucher code if adding new voucher
    if (!editingVoucher) {
      const isDuplicate = settings.vouchers.some(
        v => v.code.toUpperCase() === voucherFormData.code.toUpperCase()
      );
      if (isDuplicate) {
        setVoucherFormError('A voucher with this code already exists.');
        return;
      }
    }

    const dataToSave: Omit<VoucherSettings, 'id'> = {
      ...voucherFormData,
      maxUsagePerUser: Number(voucherFormData.maxUsagePerUser)
    };

    if (editingVoucher) {
      setSettings(prev => ({
        ...prev,
        vouchers: prev.vouchers.map(v => 
          v.id === editingVoucher.id ? { ...dataToSave, id: v.id } : v
        )
      }));
    } else {
      const newVoucher: VoucherSettings = {
        ...dataToSave,
        id: Date.now().toString(),
        code: voucherFormData.code.toUpperCase(),
      };
      setSettings(prev => ({
        ...prev,
        vouchers: [...prev.vouchers, newVoucher]
      }));
    }
    setIsVoucherModalVisible(false);
  };

  const renderVoucherSettings = () => (
    <View style={styles.section}>
      <View style={styles.voucherHeader}>
        <Text style={styles.sectionTitle}>Voucher Management</Text>
        <TouchableOpacity style={styles.addVoucherButton} onPress={handleAddNewVoucher}>
          <FontAwesome name="plus" size={16} color="#FFFFFF" />
          <Text style={styles.addVoucherButtonText}>Add Voucher</Text>
        </TouchableOpacity>
      </View>

      {settings.vouchers.length === 0 ? (
        <Text style={styles.noVouchersText}>No vouchers created yet.</Text>
      ) : (
        settings.vouchers.map((voucher) => (
          <View key={voucher.id} style={styles.voucherCard}>
            <View style={styles.voucherInfo}>
              <Text style={styles.voucherCode}>{voucher.code}</Text>
              {voucher.description && (
                <Text style={styles.voucherDescription}>{voucher.description}</Text>
              )}
              <Text style={styles.voucherDetails}>
                ₱{((voucher as any).discountAmount || (voucher as any).discountPercentage || 0).toFixed(2)} off, min. ₱{voucher.minimumOrderAmount.toFixed(2)}
                {(voucher.maxUsagePerUser ?? 0) > 0 && 
                  <Text style={styles.voucherUsageText}> (Use {voucher.maxUsagePerUser}x per user)</Text>
                }
              </Text>
            </View>
            <View style={styles.voucherStatusContainer}>
                 <Switch
                    value={voucher.enabled}
                    onValueChange={(value) => {
                        setSettings(prev => ({
                            ...prev,
                            vouchers: prev.vouchers.map(v => 
                                v.id === voucher.id ? { ...v, enabled: value } : v
                            )
                        }));
                    }}
                 />
                 <Text style={voucher.enabled ? styles.voucherStatusEnabled : styles.voucherStatusDisabled}>
                    {voucher.enabled ? 'Enabled' : 'Disabled'}
                 </Text>
            </View>
            <View style={styles.voucherActions}>
              <TouchableOpacity style={styles.editButton} onPress={() => handleEditVoucher(voucher)}>
                <FontAwesome name="pencil" size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.trashButton} onPress={() => handleDeleteVoucher(voucher)}>
                <FontAwesome name="trash" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionDescription}>
        Manage promotional vouchers. Customers can apply enabled codes in the cart if their order meets the minimum amount.
      </Text>
    </View>
  );

  const renderProductSelectionModal = () => {
    const isProductSelected = (id: string): boolean => {
      return settings.bestSellers.products.includes(id);
    };

    const toggleProductSelection = (id: string): void => {
      if (isProductSelected(id)) {
        // Remove product from best sellers
        setSettings(prev => ({
          ...prev,
          bestSellers: {
            ...prev.bestSellers,
            products: prev.bestSellers.products.filter(productId => productId !== id)
          }
        }));
      } else {
        // Only add if less than 6 products are selected
        if (settings.bestSellers.products.length < 6) {
          setSettings(prev => ({
            ...prev,
            bestSellers: {
              ...prev.bestSellers,
              products: [...prev.bestSellers.products, id]
            }
          }));
        }
      }
    };
    
    return (
      <Modal
        visible={showProductSelectionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowProductSelectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.productSelectionModal]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Best Sellers</Text>
              <TouchableOpacity 
                style={styles.closeModalButton}
                onPress={() => setShowProductSelectionModal(false)}
              >
                <FontAwesome name="times" size={22} color="#4B5563" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.selectionInfo}>
              Selected: {settings.bestSellers.products.length}/6 products
            </Text>
            
            {products.length === 0 ? (
              <View style={[styles.noProductsContainer, { flex: 1 }]}>
                <FontAwesome name="exclamation-circle" size={40} color="#9CA3AF" />
                <Text style={styles.noProductsText}>No products available</Text>
              </View>
            ) : (
              <FlatList
                data={products}
                keyExtractor={(item) => item.id}
                style={styles.productsList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.productSelectionItem,
                      isProductSelected(item.id) && styles.selectedProductSelectionItem
                    ]}
                    onPress={() => toggleProductSelection(item.id)}
                    disabled={!isProductSelected(item.id) && settings.bestSellers.products.length >= 6}
                  >
                    <View style={styles.productSelectionInfo}>
                      {item.imageUrl ? (
                        <Image 
                          source={{ uri: item.imageUrl }} 
                          style={styles.productModalThumbnail} 
                        />
                      ) : (
                        <View style={styles.productModalPlaceholder}>
                          <FontAwesome name="image" size={20} color="#9CA3AF" />
                        </View>
                      )}
                      <View>
                        <Text style={styles.productModalName}>{item.name}</Text>
                      </View>
                    </View>
                    <View style={styles.checkboxContainer}>
                      {isProductSelected(item.id) && (
                        <View style={styles.checkbox}>
                          <FontAwesome name="check" size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowProductSelectionModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  styles.confirmButton,
                  settings.bestSellers.products.length < 3 && styles.disabledConfirmButton
                ]}
                onPress={() => {
                  if (settings.bestSellers.products.length >= 3) {
                    setShowProductSelectionModal(false);
                  } else {
                    Alert.alert('Minimum Selection', 'Please select at least 3 products.');
                  }
                }}
                disabled={settings.bestSellers.products.length < 3}
              >
                <Text style={styles.modalButtonText}>Confirm Selection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderDeleteConfirmationModal = () => (
    <Modal
      visible={isDeleteModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setIsDeleteModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Confirm Delete</Text>
          
          <Text style={styles.deleteConfirmText}>
            Are you sure you want to delete the voucher "{voucherToDelete?.code}"?
          </Text>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.cancelButton]} 
              onPress={() => setIsDeleteModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, styles.modalDeleteButton]} 
              onPress={confirmDeleteVoucher}
            >
              <FontAwesome name="trash" size={18} color="#FFFFFF" style={styles.deleteButtonIcon} />
              <Text style={styles.modalButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderSuccessModal = () => (
    <Modal
      visible={showSuccessModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowSuccessModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, styles.successModalContent]}>
          <View style={styles.successIconContainer}>
            <FontAwesome name="check-circle" size={50} color="#F36514" />
          </View>
          
          <Text style={styles.successTitle}>Success!</Text>
          <Text style={styles.successMessage}>{successMessage}</Text>
          
          <TouchableOpacity 
            style={styles.successButton}
            onPress={() => setShowSuccessModal(false)}
          >
            <Text style={styles.successButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'general' && styles.activeTab]}
            onPress={() => setActiveTab('general')}
          >
            <Text style={[styles.tabText, activeTab === 'general' && styles.activeTabText]}>Notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'rewards' && styles.activeTab]}
            onPress={() => setActiveTab('rewards')}
          >
            <Text style={[styles.tabText, activeTab === 'rewards' && styles.activeTabText]}>Rewards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'banners' && styles.activeTab]}
            onPress={() => setActiveTab('banners')}
          >
            <Text style={[styles.tabText, activeTab === 'banners' && styles.activeTabText]}>Banners</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'bestSellers' && styles.activeTab]}
            onPress={() => setActiveTab('bestSellers')}
          >
            <Text style={[styles.tabText, activeTab === 'bestSellers' && styles.activeTabText]}>Best Sellers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'vouchers' && styles.activeTab]}
            onPress={() => setActiveTab('vouchers')}
          >
            <Text style={[styles.tabText, activeTab === 'vouchers' && styles.activeTabText]}>Vouchers</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'general' && renderGeneralSettings()}
        {activeTab === 'rewards' && renderRewardsSettings()}
        {activeTab === 'banners' && renderBannerSettings()}
        {activeTab === 'bestSellers' && renderBestSellersSettings()}
        {activeTab === 'vouchers' && renderVoucherSettings()}

        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {renderProductSelectionModal()}
      {renderDeleteConfirmationModal()}
      {renderSuccessModal()}

      <Modal
        visible={isVoucherModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsVoucherModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.voucherModalContent]}>
            <Text style={styles.modalTitle}>{editingVoucher ? 'Edit Voucher' : 'Add New Voucher'}</Text>
            
            {voucherFormError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{voucherFormError}</Text>
              </View>
            )}

            <ScrollView 
              style={styles.voucherFormScroll}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Voucher Code</Text>
                <TextInput
                  style={[
                    styles.modalInput, 
                    !voucherFormData.code && voucherFormError ? styles.inputError : null
                  ]}
                  placeholder="Voucher Code (e.g., SALE100)"
                  value={voucherFormData.code}
                  onChangeText={(text) => {
                    setVoucherFormData(prev => ({ ...prev, code: text.toUpperCase() }));
                    if (voucherFormError && !text) setVoucherFormError(null);
                  }}
                  autoCapitalize="characters"
                />
              </View>
              
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Description (optional, e.g., Weekend Special)"
                  value={voucherFormData.description}
                  onChangeText={(text) => setVoucherFormData(prev => ({ ...prev, description: text }))}
                />
              </View>
              
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Discount Amount (₱)</Text>
                <TextInput
                  style={[
                    styles.modalInput, 
                    voucherFormData.discountAmount <= 0 && voucherFormError ? styles.inputError : null
                  ]}
                  placeholder="Discount Amount (e.g., 100)"
                  value={voucherFormData.discountAmount.toString()}
                  onChangeText={(text) => {
                    const value = parseFloat(text) || 0;
                    setVoucherFormData(prev => ({ ...prev, discountAmount: Math.max(0, value) }));
                    if (voucherFormError && value > 0) setVoucherFormError(null);
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.inputDescription}>Enter fixed amount to discount (in ₱)</Text>
              </View>
              
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Minimum Order Amount</Text>
                <TextInput
                  style={[
                    styles.modalInput, 
                    voucherFormData.minimumOrderAmount < 0 && voucherFormError ? styles.inputError : null
                  ]}
                  placeholder="Minimum Order Amount (e.g., 500)"
                  value={voucherFormData.minimumOrderAmount.toString()}
                  onChangeText={(text) => {
                    const value = parseFloat(text) || 0;
                    setVoucherFormData(prev => ({ ...prev, minimumOrderAmount: Math.max(0, value) }));
                    if (voucherFormError && value >= 0) setVoucherFormError(null);
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.inputDescription}>Minimum purchase required to use this voucher</Text>
              </View>
              
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Max Usage Per User</Text>
                <TextInput
                  style={[
                    styles.modalInput, 
                    voucherFormData.maxUsagePerUser > 0 && !Number.isInteger(voucherFormData.maxUsagePerUser) && voucherFormError ? styles.inputError : null
                  ]}
                  placeholder="Max Usage Per User (0 for unlimited)"
                  value={voucherFormData.maxUsagePerUser.toString()}
                  onChangeText={(text) => {
                    const value = text === '' ? '' : text.replace(/[^0-9]/g, '');
                    setVoucherFormData(prev => ({ 
                        ...prev, 
                        maxUsagePerUser: value === '' ? 0 : parseInt(value, 10) || 0 
                    }));
                    if (voucherFormError) setVoucherFormError(null);
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.inputDescription}>Enter 0 for unlimited usage per customer</Text>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsVoucherModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleSaveVoucherModal}>
                <Text style={styles.modalButtonText}>Save Voucher</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bannerList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  bannerItem: {
    width: 300,
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    objectFit: 'cover',
  },
  deleteBannerButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
  },
  addBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F36514',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  addBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 12,
  },
  tabContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 4,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#F36514',
  },
  tabText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#F36514',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 16,
    lineHeight: 20,
  },
  settingItem: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#4B5563',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },
  disabledSetting: {
    opacity: 0.5,
  },
  disabledInput: {
    backgroundColor: '#E5E7EB',
  },
  saveButton: {
    backgroundColor: '#F36514',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#1F2937',
  },
  voucherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addVoucherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F36514',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  addVoucherButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  noVouchersText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 16,
    marginTop: 20,
  },
  voucherCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  voucherInfo: {
    flex: 1,
  },
  voucherCode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  voucherDescription: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 4,
  },
  voucherDetails: {
    fontSize: 14,
    color: '#6B7280',
    flexWrap: 'wrap',
  },
  voucherUsageText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#6B7280',
  },
   voucherStatusContainer: {
      alignItems: 'center',
      marginHorizontal: 12, 
   },
  voucherStatusEnabled: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
    marginTop: 2,
  },
  voucherStatusDisabled: {
      fontSize: 12,
      color: '#EF4444',
      fontWeight: '500',
      marginTop: 2,
  },
  voucherActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashButton: {
    padding: 8,
    backgroundColor: '#EF4444',
    borderRadius: 6,
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 500,
  },
  voucherModalContent: {
    maxHeight: Platform.OS === 'web' ? '90%' : '80%',
  },
  voucherFormScroll: {
    maxHeight: 380,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 4,
  },
  modalSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexShrink: 0,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: '#6B7280',
  },
  confirmButton: {
    backgroundColor: '#F36514',
  },
  modalDeleteButton: {
    backgroundColor: '#EF4444',
  },
  selectedProductsContainer: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F9FAFB',
  },
  selectedProductsList: {
    gap: 8,
  },
  selectedProductItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  productInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  productThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 4,
    marginRight: 10,
  },
  productPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  productTextInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  productPrice: {
    fontSize: 13,
    color: '#059669',
  },
  removeProductButton: {
    backgroundColor: '#EF4444',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectProductsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F36514',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  buttonIcon: {
    marginRight: 8,
  },
  selectProductsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  disabledConfirmButton: {
    backgroundColor: '#9CA3AF',
  },
  warningText: {
    color: '#EF4444',
    marginBottom: 16,
    fontSize: 14,
  },
  productSelectionModal: {
    width: '90%',
    maxWidth: 600,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeModalButton: {
    padding: 8,
  },
  selectionInfo: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 12,
  },
  productsList: {
    flex: 1,
    marginBottom: 16,
  },
  productSelectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  selectedProductSelectionItem: {
    backgroundColor: '#FEF3ED',
    borderLeftWidth: 3,
    borderLeftColor: '#F36514',
  },
  productSelectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  productModalThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
  },
  productModalPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productModalName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 4,
  },
  productModalPrice: {
    fontSize: 14,
    color: '#059669',
  },
  checkboxContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F36514',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F36514',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noProductsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noProductsText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
  },
  bestSellerDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 16,
  },
  deleteConfirmText: {
    fontSize: 16,
    color: '#4B5563',
    marginBottom: 24,
    textAlign: 'center',
  },
  deleteButtonIcon: {
    marginRight: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#4B5563',
    marginBottom: 8,
  },
  inputDescription: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
  },
  inputError: {
    borderColor: '#EF4444',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    maxWidth: 320,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
  },
  successButton: {
    backgroundColor: '#F36514',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  successButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

